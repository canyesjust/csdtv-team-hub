import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { openVote } from '@/lib/board-meetings/motion-control'
import type { VoteMode } from '@/lib/board-meetings/motion-types'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string; motion_id: string }> },
) {
  const { production_id, motion_id } = await params
  return withControlContext(production_id, async ({ service, boardMeetingId, teamUserId }) => {
    const body = await request.json().catch(() => ({})) as { vote_mode?: VoteMode }
    const voteMode = body.vote_mode === 'roll_call' ? 'roll_call' : 'voice'
    try {
      await openVote(service, boardMeetingId, motion_id, teamUserId, voteMode)
      return NextResponse.json({ ok: true })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to open vote')
    }
  })
}
