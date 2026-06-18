import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { extendActiveTimer } from '@/lib/board-meetings/broadcast-control'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  const body = await request.json().catch(() => ({})) as { seconds?: number }
  const addSeconds = Number.isFinite(body.seconds) ? Number(body.seconds) : 60
  return withControlContext(production_id, async ctx => {
    try {
      const duration = await extendActiveTimer(ctx.service, ctx.boardMeetingId, ctx.teamUserId, addSeconds)
      return NextResponse.json({ success: true, duration_seconds: duration })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Extend timer failed')
    }
  })
}
