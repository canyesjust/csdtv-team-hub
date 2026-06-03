import { NextResponse } from 'next/server'
import { getActorTeamUser } from '@/lib/server/auth'
import { getImpersonationSessionForActor } from '@/lib/server/impersonation'

export const dynamic = 'force-dynamic'

export async function GET() {
  const actor = await getActorTeamUser()
  if (!actor) {
    return NextResponse.json({ active: false }, { status: 401 })
  }

  if (actor.role !== 'Manager') {
    return NextResponse.json({ active: false, actor: { id: actor.id, role: actor.role } })
  }

  const session = await getImpersonationSessionForActor(actor.id)
  if (!session) {
    return NextResponse.json({ active: false, actor: { id: actor.id, role: actor.role } })
  }

  return NextResponse.json({
    active: true,
    actor: {
      id: session.actor.id,
      name: session.actor.name,
      role: session.actor.role,
    },
    subject: {
      id: session.subject.id,
      name: session.subject.name,
      role: session.subject.role,
      avatar_color: session.subject.avatar_color,
      dashboard_profile: session.subject.dashboard_profile,
    },
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
  })
}
