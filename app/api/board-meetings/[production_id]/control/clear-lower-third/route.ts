import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { clearActiveLowerThird } from '@/lib/board-meetings/lower-third-control'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(production_id, async ctx => {
    try {
      await clearActiveLowerThird(ctx.service, ctx.boardMeetingId, ctx.teamUserId)
      return NextResponse.json({ success: true })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to clear lower third')
    }
  })
}
