import { NextResponse } from 'next/server'
import { getActorTeamUser, getAuthenticatedTeamUser } from '@/lib/server/auth'
import { loadTeamProfile } from '@/lib/server/impersonation'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const actor = await getActorTeamUser()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const effective = await getAuthenticatedTeamUser()
  if (!effective) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = getServiceSupabaseClient()
  if (!service) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const [team, actorProfile] = await Promise.all([
    loadTeamProfile(service, effective.id),
    loadTeamProfile(service, actor.id),
  ])

  if (!team) {
    return NextResponse.json({ error: 'Team member not found' }, { status: 404 })
  }

  const isViewAs = effective.id !== actor.id

  return NextResponse.json({
    team,
    isViewAs,
    actor: actorProfile
      ? { id: actorProfile.id, name: actorProfile.name, role: actorProfile.role }
      : { id: actor.id, role: actor.role, name: 'Manager' },
  })
}
