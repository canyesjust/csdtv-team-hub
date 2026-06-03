import { NextResponse } from 'next/server'
import { loadTasksDashboardData } from '@/lib/dashboard/load-tasks-data'
import { createAuthSupabaseClient, getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { loadTeamProfile } from '@/lib/server/impersonation'

export const dynamic = 'force-dynamic'

export async function GET() {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = getServiceSupabaseClient()
  if (!service) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const profile = await loadTeamProfile(service, teamUser.id)
  if (!profile) {
    return NextResponse.json({ error: 'Team member not found' }, { status: 404 })
  }

  const supabase = await createAuthSupabaseClient()
  try {
    const data = await loadTasksDashboardData(supabase, {
      id: profile.id,
      name: profile.name,
      role: profile.role,
    })
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load tasks'
    console.error('GET /api/dashboard/tasks-summary', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
