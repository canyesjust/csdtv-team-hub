import { redirect } from 'next/navigation'
import { createAuthSupabaseClient } from '@/lib/server/auth'

// Decide on the server so a signed-in user goes straight to the dashboard
// instead of flashing the login page while the client checks the session.
export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = await createAuthSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  redirect(user ? '/dashboard' : '/login')
}
