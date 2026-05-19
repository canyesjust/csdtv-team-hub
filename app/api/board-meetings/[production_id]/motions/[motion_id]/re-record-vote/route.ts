import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { recordVotes } from '@/lib/board-meetings/motion-control'
import type { VoteValue } from '@/lib/board-meetings/motion-types'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string; motion_id: string }> },
) {
  const { production_id, motion_id } = await params
  return withControlContext(production_id, async ({ service, boardMeetingId, teamUserId }) => {
    const body = await request.json() as { votes?: { person_id: string; vote: VoteValue }[] }
    if (!body.votes?.length) return controlError('votes array required')
    try {
      const result = await recordVotes(service, boardMeetingId, motion_id, teamUserId, body.votes, {
        re_record: true,
      })
      return NextResponse.json(result)
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to re-record vote')
    }
  })
}
