import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { toggleOverlay } from '@/lib/board-meetings/broadcast-control'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(production_id, async ctx => {
    const body = await request.json().catch(() => ({}))
    const visible = typeof body?.visible === 'boolean' ? body.visible : undefined
    try {
      const next = await toggleOverlay(ctx.service, ctx.boardMeetingId, ctx.teamUserId, visible)
      return NextResponse.json({ success: true, overlay_visible: next })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Toggle overlay failed')
    }
  })
}
