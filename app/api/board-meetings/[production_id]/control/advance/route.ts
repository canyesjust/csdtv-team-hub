import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { advanceItem } from '@/lib/board-meetings/broadcast-control'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(production_id, async ctx => {
    try {
      const item = await advanceItem(ctx.service, ctx.boardMeetingId, ctx.teamUserId, 1)
      return NextResponse.json({ success: true, current_item: item })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Advance failed')
    }
  })
}
