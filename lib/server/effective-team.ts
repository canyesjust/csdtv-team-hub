import type { SupabaseClient } from '@supabase/supabase-js'
import { getTeamRowForAuthUser } from '@/lib/server/auth'
import { getActiveImpersonationForActor } from '@/lib/server/impersonation'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export type EffectiveTeamRow = { id: string; role: string; dashboard_profile: string }

/** Real signed-in team row (never impersonated). */
export async function getActorTeamRow(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<EffectiveTeamRow | 'pending-link' | null> {
  const row = await getTeamRowForAuthUser(supabase, user)
  if (!row || row === 'pending-link') return row
  return {
    id: row.id,
    role: row.role,
    dashboard_profile: row.dashboard_profile ?? 'default',
  }
}

/** Team row used for nav, redirects, and RLS helpers when view-as is active. */
export async function getEffectiveTeamRow(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<EffectiveTeamRow | 'pending-link' | null> {
  const actor = await getActorTeamRow(supabase, user)
  if (!actor || actor === 'pending-link') return actor
  if (actor.role !== 'Manager') return actor

  const session = await getActiveImpersonationForActor(actor.id)
  if (!session) return actor

  const service = getServiceSupabaseClient()
  if (!service) return actor

  const { data: subject } = await service
    .from('team')
    .select('id, role, dashboard_profile')
    .eq('id', session.subject_team_id)
    .maybeSingle()

  if (!subject) return actor
  return {
    id: subject.id,
    role: subject.role,
    dashboard_profile: subject.dashboard_profile ?? 'default',
  }
}
