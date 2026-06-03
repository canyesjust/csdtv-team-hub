import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'
import { ONBOARDING_TRACK_STUDENT_INTERN } from '@/lib/onboarding/constants'
import { replaceStudentInternOnboardingTemplate } from '@/lib/onboarding/seed-database'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

/** Manager-only: reload the default student intern onboarding checklist and sync active assignments. */
export async function POST() {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser || !isManagerRole(teamUser.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = getServiceSupabaseClient()
  if (!service) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const result = await replaceStudentInternOnboardingTemplate(service)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ success: true, trackId: ONBOARDING_TRACK_STUDENT_INTERN })
}
