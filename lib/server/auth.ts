import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

type TeamUser = {
  id: string
  role: string
}

export async function getAuthenticatedTeamUser(): Promise<TeamUser | null> {
  const cookieStore = await cookies()
  const authClient = createServerClient(
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
    }
  )

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

export function isManagerRole(role: string | null | undefined): boolean {
  return (role || '').toLowerCase() === 'manager'
}

/** Linked team row exists for this auth user. */
export async function getTeamRowForAuthUser(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<{ id: string; role: string } | 'pending-link' | null> {
  const { data: byUid } = await supabase
    .from('team')
    .select('id, role')
    .eq('supabase_user_id', user.id)
    .maybeSingle()
  if (byUid) return { id: byUid.id, role: byUid.role }

  if (!user.email) return null
  const { data: byEmail } = await supabase
    .from('team')
    .select('id, role, supabase_user_id')
    .eq('email', user.email)
    .maybeSingle()
  if (byEmail && !byEmail.supabase_user_id) return 'pending-link'
  return null
}
