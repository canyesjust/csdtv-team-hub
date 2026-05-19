import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { setActiveLowerThird } from '@/lib/board-meetings/lower-third-control'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(production_id, async ctx => {
    const body = await request.json().catch(() => ({}))
    const personId = body?.person_id
    if (!personId || typeof personId !== 'string') {
      return controlError('person_id required')
    }
    try {
      await setActiveLowerThird(ctx.service, ctx.boardMeetingId, ctx.teamUserId, personId)
      return NextResponse.json({ success: true })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to set lower third')
    }
  })
}
