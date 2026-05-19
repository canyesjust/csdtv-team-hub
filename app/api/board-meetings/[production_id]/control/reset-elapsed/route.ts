import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { resetMeetingElapsed } from '@/lib/board-meetings/broadcast-control'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(production_id, async ctx => {
    try {
      const elapsed_started_at = await resetMeetingElapsed(ctx.service, ctx.boardMeetingId, ctx.teamUserId)
      return NextResponse.json({ success: true, elapsed_started_at })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to reset elapsed clock')
    }
  })
}
