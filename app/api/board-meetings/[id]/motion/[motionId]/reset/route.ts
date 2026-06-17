import { NextRequest, NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { resetMotion } from '@/lib/board-meetings/motion-control'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string; motionId: string }> }) {
  const { id, motionId } = await ctx.params
  return withControlContext(id, async c => {
    try {
      await resetMotion(c.service, c.boardMeetingId, motionId, c.teamUserId)
      return NextResponse.json({ success: true })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to reset motion', 500)
    }
  })
}
