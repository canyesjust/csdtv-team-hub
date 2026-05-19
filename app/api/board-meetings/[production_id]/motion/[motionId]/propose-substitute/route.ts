import { NextResponse } from 'next/server'
import { withMotionContext, motionError, assertMotionInMeeting } from '@/lib/board-meetings/motion-route'
import { proposeSubstitute } from '@/lib/board-meetings/motion-api'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string; motionId: string }> },
) {
  const { production_id, motionId: parentMotionId } = await params
  return withMotionContext(production_id, async ctx => {
    if (!(await assertMotionInMeeting(ctx.service, parentMotionId, ctx.boardMeetingId))) {
      return motionError('Motion not found', 404)
    }
    const body = await request.json().catch(() => null)
    if (!body || typeof body.agenda_item_id !== 'string' || !body.agenda_item_id) {
      return motionError('agenda_item_id is required')
    }
    try {
      const result = await proposeSubstitute(ctx, parentMotionId, body.agenda_item_id)
      return NextResponse.json(result)
    } catch (e) {
      return motionError(e instanceof Error ? e.message : 'Failed to propose substitute')
    }
  })
}
