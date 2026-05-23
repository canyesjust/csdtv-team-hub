import { NextResponse } from 'next/server'
import { getActorTeamUser, isManagerRole } from '@/lib/server/auth'
import { stopImpersonation } from '@/lib/server/impersonation'

export const dynamic = 'force-dynamic'

export async function POST() {
  const actor = await getActorTeamUser()
  if (!actor || !isManagerRole(actor.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await stopImpersonation(actor.id)
  return NextResponse.json({ ok: true })
}
