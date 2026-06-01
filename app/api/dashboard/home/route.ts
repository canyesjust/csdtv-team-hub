import { NextResponse } from 'next/server'
import { loadDashboardHomeData } from '@/lib/dashboard/load-home-data'
import { createAuthSupabaseClient, getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { loadTeamProfile } from '@/lib/server/impersonation'
import { isStudentInternRole, STUDENT_INTERN_HOME_PATH } from '@/lib/roles'

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

  if (isStudentInternRole(profile.role)) {
    return NextResponse.json({
      redirect: STUDENT_INTERN_HOME_PATH,
      user: { id: profile.id, name: profile.name, role: profile.role },
    })
  }

  const supabase = await createAuthSupabaseClient()
  try {
    const data = await loadDashboardHomeData(supabase, {
      includeManagerOps: isManagerRole(profile.role),
    })

    return NextResponse.json({
      user: { id: profile.id, name: profile.name, role: profile.role },
      teamMembers: data.teamMembers,
      weekProductions: data.weekProductions,
      managerOps: data.managerOps,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load dashboard'
    console.error('GET /api/dashboard/home', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
