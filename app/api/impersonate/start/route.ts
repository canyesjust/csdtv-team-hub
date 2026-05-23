import { NextResponse } from 'next/server'
import { getActorTeamUser, isManagerRole } from '@/lib/server/auth'
import { getImpersonationSessionForActor, startImpersonation } from '@/lib/server/impersonation'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const actor = await getActorTeamUser()
  if (!actor || !isManagerRole(actor.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const teamMemberId = typeof body.teamMemberId === 'string' ? body.teamMemberId.trim() : ''
  if (!teamMemberId) {
    return NextResponse.json({ error: 'teamMemberId is required' }, { status: 400 })
  }

  const result = await startImpersonation(actor.id, teamMemberId)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  const session = await getImpersonationSessionForActor(actor.id)
  return NextResponse.json({ ok: true, session })
}
