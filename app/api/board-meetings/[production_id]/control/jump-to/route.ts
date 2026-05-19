import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { jumpToItem } from '@/lib/board-meetings/broadcast-control'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(production_id, async ctx => {
    const body = await request.json().catch(() => ({}))
    const agendaItemId = body?.agenda_item_id as string | undefined
    if (!agendaItemId) return controlError('agenda_item_id required')
    try {
      await jumpToItem(ctx.service, ctx.boardMeetingId, agendaItemId, ctx.teamUserId)
      return NextResponse.json({ success: true })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Jump failed')
    }
  })
}
