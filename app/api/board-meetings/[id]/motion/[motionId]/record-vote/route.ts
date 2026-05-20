import { NextRequest, NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { recordVote } from '@/lib/board-meetings/motion-api'
import type { VoteValue } from '@/lib/board-meetings/motion-types'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; motionId: string }> }) {
  const { id, motionId } = await ctx.params
  return withControlContext(id, async c => {
    try {
      const body = await req.json()
      const result = await recordVote(c, motionId, body.person_id, body.vote as VoteValue)
      return NextResponse.json({
        ok: true,
        person_id: result.person_id,
        vote: result.vote,
        tally: {
          yea: result.tally.yea,
          nay: result.tally.nay,
          abstain: result.tally.abstain,
          absent: result.tally.absent,
        },
        motion_status: result.motion_status,
      })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to record vote', 500)
    }
  })
}
