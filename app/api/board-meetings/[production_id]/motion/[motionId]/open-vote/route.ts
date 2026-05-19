import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { openVote } from '@/lib/board-meetings/motion-control'
import type { VoteMode } from '@/lib/board-meetings/motion-types'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string; motionId: string }> },
) {
  const { production_id, motionId } = await params
  return withControlContext(production_id, async ({ service, boardMeetingId, teamUserId }) => {
    const body = await request.json().catch(() => ({}))
    const voteMode = (body.vote_mode as VoteMode) || 'voice'
    if (voteMode !== 'voice' && voteMode !== 'roll_call') {
      return controlError('vote_mode must be voice or roll_call')
    }
    try {
      await openVote(service, boardMeetingId, motionId, teamUserId, voteMode)
      return NextResponse.json({ ok: true })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to open vote')
    }
  })
}
