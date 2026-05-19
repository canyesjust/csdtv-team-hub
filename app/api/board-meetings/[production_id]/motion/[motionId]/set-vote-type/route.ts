import { NextResponse } from 'next/server'
import { withMotionContext, motionError, assertMotionInMeeting } from '@/lib/board-meetings/motion-route'
import { setMotionVoteTypeApi } from '@/lib/board-meetings/motion-api'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string; motionId: string }> },
) {
  const { production_id, motionId } = await params
  return withMotionContext(production_id, async ctx => {
    if (!(await assertMotionInMeeting(ctx.service, motionId, ctx.boardMeetingId))) {
      return motionError('Motion not found', 404)
    }
    const body = await request.json().catch(() => null)
    const voteType = body?.vote_type ?? body?.vote_mode
    if (voteType !== 'voice' && voteType !== 'roll_call') {
      return motionError('vote_type must be voice or roll_call')
    }
    try {
      await setMotionVoteTypeApi(ctx, motionId, voteType)
      return NextResponse.json({ ok: true })
    } catch (e) {
      return motionError(e instanceof Error ? e.message : 'Failed to set vote type')
    }
  })
}
