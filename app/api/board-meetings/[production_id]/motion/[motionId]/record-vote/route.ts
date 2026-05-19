import { NextResponse } from 'next/server'
import { withMotionContext, motionError, assertMotionInMeeting } from '@/lib/board-meetings/motion-route'
import { recordVote } from '@/lib/board-meetings/motion-api'
import type { VoteValue } from '@/lib/board-meetings/motion-types'

const VOTES = new Set(['yea', 'nay', 'abstain', 'absent', 'recused'])

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
    if (!body || typeof body.person_id !== 'string' || !body.person_id) {
      return motionError('person_id is required')
    }
    if (typeof body.vote !== 'string' || !VOTES.has(body.vote)) {
      return motionError('vote must be yea, nay, abstain, absent, or recused')
    }
    try {
      await recordVote(ctx, motionId, body.person_id, body.vote as VoteValue)
      return NextResponse.json({ ok: true })
    } catch (e) {
      return motionError(e instanceof Error ? e.message : 'Failed to record vote')
    }
  })
}
