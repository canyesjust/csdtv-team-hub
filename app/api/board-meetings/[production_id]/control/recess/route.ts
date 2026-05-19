import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { setBroadcastMode } from '@/lib/board-meetings/broadcast-control'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(production_id, async ctx => {
    const body = await request.json().catch(() => ({}))
    try {
      await setBroadcastMode(ctx.service, ctx.boardMeetingId, ctx.teamUserId, 'recess', {
        message: body?.message,
        duration_seconds: body?.duration_seconds,
      })
      return NextResponse.json({ success: true })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Recess failed')
    }
  })
}
