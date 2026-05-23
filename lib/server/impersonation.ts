import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export type TeamProfile = {
  id: string
  name: string
  role: string
  email: string | null
  avatar_color: string | null
}

export type ImpersonationSession = {
  subject: TeamProfile
  actor: TeamProfile
  startedAt: string
  expiresAt: string
}

const SESSION_HOURS = 8

export async function getActiveImpersonationForActor(
  actorTeamId: string,
): Promise<{ subject_team_id: string; started_at: string; expires_at: string } | null> {
  const service = getServiceSupabaseClient()
  if (!service) return null

  const { data } = await service
    .from('impersonation_sessions')
    .select('subject_team_id, started_at, expires_at')
    .eq('actor_team_id', actorTeamId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  return data
}

export async function loadTeamProfile(
  service: SupabaseClient,
  teamId: string,
): Promise<TeamProfile | null> {
  const { data } = await service
    .from('team')
    .select('id, name, role, email, avatar_color')
    .eq('id', teamId)
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id,
    name: data.name,
    role: data.role,
    email: data.email,
    avatar_color: data.avatar_color,
  }
}

export async function getImpersonationSessionForActor(
  actorTeamId: string,
): Promise<ImpersonationSession | null> {
  const service = getServiceSupabaseClient()
  if (!service) return null

  const row = await getActiveImpersonationForActor(actorTeamId)
  if (!row) return null

  const [actor, subject] = await Promise.all([
    loadTeamProfile(service, actorTeamId),
    loadTeamProfile(service, row.subject_team_id),
  ])
  if (!actor || !subject) return null

  return {
    actor,
    subject,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
  }
}

export async function startImpersonation(
  actorTeamId: string,
  subjectTeamId: string,
): Promise<{ error?: string }> {
  if (actorTeamId === subjectTeamId) {
    return { error: 'Cannot view as yourself' }
  }

  const service = getServiceSupabaseClient()
  if (!service) return { error: 'Server configuration error' }

  const subject = await loadTeamProfile(service, subjectTeamId)
  if (!subject) return { error: 'Team member not found' }

  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString()

  await service.from('impersonation_sessions').delete().eq('actor_team_id', actorTeamId)

  const { error } = await service.from('impersonation_sessions').insert({
    actor_team_id: actorTeamId,
    subject_team_id: subjectTeamId,
    expires_at: expiresAt,
  })

  if (error) return { error: error.message }

  await service.from('impersonation_audit').insert({
    actor_team_id: actorTeamId,
    subject_team_id: subjectTeamId,
    action: 'start',
  })

  return {}
}

export async function stopImpersonation(actorTeamId: string): Promise<void> {
  const service = getServiceSupabaseClient()
  if (!service) return

  const active = await getActiveImpersonationForActor(actorTeamId)
  if (!active) return

  await service.from('impersonation_sessions').delete().eq('actor_team_id', actorTeamId)

  await service.from('impersonation_audit').insert({
    actor_team_id: actorTeamId,
    subject_team_id: active.subject_team_id,
    action: 'stop',
  })
}

export async function isActorImpersonating(actorTeamId: string): Promise<boolean> {
  const row = await getActiveImpersonationForActor(actorTeamId)
  return row != null
}
