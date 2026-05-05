import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
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
