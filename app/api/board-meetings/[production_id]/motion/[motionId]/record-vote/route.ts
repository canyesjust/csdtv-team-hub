import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { recordMotionVote, recordVotes } from '@/lib/board-meetings/motion-control'
import type { VoteValue } from '@/lib/board-meetings/motion-types'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string; motionId: string }> },
) {
  const { production_id, motionId } = await params
  return withControlContext(production_id, async ({ service, boardMeetingId, teamUserId }) => {
    const body = await request.json()
    try {
      if (body.person_id && body.vote) {
        await recordMotionVote(
          service,
          boardMeetingId,
          motionId,
          teamUserId,
          body.person_id as string,
          body.vote as VoteValue,
        )
        return NextResponse.json({ ok: true })
      }
      const votes = body.votes as { person_id: string; vote: VoteValue }[] | undefined
      if (!votes?.length) return controlError('votes required')
      const result = await recordVotes(service, boardMeetingId, motionId, teamUserId, votes, {
        defer_result_display: true,
      })
      return NextResponse.json(result)
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to record vote')
    }
  })
}
