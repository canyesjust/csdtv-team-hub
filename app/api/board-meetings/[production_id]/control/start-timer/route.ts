import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { startTimer } from '@/lib/board-meetings/broadcast-control'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(production_id, async ctx => {
    const body = await request.json().catch(() => ({}))
    try {
      const timer = await startTimer(ctx.service, ctx.boardMeetingId, ctx.teamUserId, {
        template_id: body?.template_id,
        duration_seconds: body?.duration_seconds,
        label: body?.label,
        show_on_broadcast: body?.show_on_broadcast,
        show_on_speaker_monitor: body?.show_on_speaker_monitor,
        show_on_dais: body?.show_on_dais,
      })
      return NextResponse.json({ success: true, timer })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Start timer failed')
    }
  })
}
