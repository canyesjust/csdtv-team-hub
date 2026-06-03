import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getImpersonationSessionForActor } from '@/lib/server/impersonation'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export type TeamUser = {
  id: string
  role: string
}

/** Supabase client using the signed-in user's session (respects RLS). */
export async function createAuthSupabaseClient() {
  return createAuthServerClient()
}

async function createAuthServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {}
        },
      },
    },
  )
}

async function loadTeamUserByAuthUid(): Promise<TeamUser | null> {
  const authClient = await createAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null

  const service = createClient(url, key)
  const { data } = await service
    .from('team')
    .select('id, role')
    .eq('supabase_user_id', user.id)
    .maybeSingle()

  if (!data) return null
  return { id: data.id, role: data.role }
}

/** Signed-in user (manager account), ignoring view-as. */
export async function getActorTeamUser(): Promise<TeamUser | null> {
  return loadTeamUserByAuthUid()
}

/** Effective team user for permissions and data (subject while view-as is active). */
export async function getAuthenticatedTeamUser(): Promise<TeamUser | null> {
  const actor = await loadTeamUserByAuthUid()
  if (!actor) return null
  if (actor.role !== 'Manager') return actor

  const session = await getImpersonationSessionForActor(actor.id)
  if (!session) return actor

  return { id: session.subject.id, role: session.subject.role }
}

export function isManagerRole(role: string | null | undefined): boolean {
  return (role || '').toLowerCase() === 'manager'
}

/** Reject API mutations while a manager is in view-as mode. */
export async function assertActorNotImpersonating(): Promise<{ ok: true } | { ok: false; message: string }> {
  const actor = await getActorTeamUser()
  if (!actor) return { ok: false, message: 'Unauthorized' }
  if (actor.role !== 'Manager') return { ok: true }

  const session = await getImpersonationSessionForActor(actor.id)
  if (session) {
    return { ok: false, message: 'Exit view-as mode before performing this action' }
  }
  return { ok: true }
}

/** Linked team row exists for this auth user. */
export async function getTeamRowForAuthUser(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<{ id: string; role: string; dashboard_profile: string } | 'pending-link' | null> {
  // Service role avoids RLS gaps during the access gate (middleware).
  const db = getServiceSupabaseClient() ?? supabase

  const { data: byUid } = await db
    .from('team')
    .select('id, role, dashboard_profile')
    .eq('supabase_user_id', user.id)
    .maybeSingle()
  if (byUid) {
    return {
      id: byUid.id,
      role: byUid.role,
      dashboard_profile: byUid.dashboard_profile ?? 'default',
    }
  }

  if (!user.email) return null
  const emailNorm = user.email.trim().toLowerCase()
  const { data: byEmail } = await db
    .from('team')
    .select('id, role, dashboard_profile, supabase_user_id')
    .eq('email', emailNorm)
    .maybeSingle()
  if (byEmail && !byEmail.supabase_user_id) return 'pending-link'
  return null
}
