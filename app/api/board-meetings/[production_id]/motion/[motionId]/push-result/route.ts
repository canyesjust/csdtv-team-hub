import { NextResponse } from 'next/server'
import { withMotionContext, motionError, assertMotionInMeeting } from '@/lib/board-meetings/motion-route'
import { pushResult } from '@/lib/board-meetings/motion-api'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ production_id: string; motionId: string }> },
) {
  const { production_id, motionId } = await params
  return withMotionContext(production_id, async ctx => {
    if (!(await assertMotionInMeeting(ctx.service, motionId, ctx.boardMeetingId))) {
      return motionError('Motion not found', 404)
    }
    try {
      const result = await pushResult(ctx, motionId)
      return NextResponse.json(result)
    } catch (e) {
      return motionError(e instanceof Error ? e.message : 'Failed to push result')
    }
  })
}
