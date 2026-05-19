import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { pushQr } from '@/lib/board-meetings/qr-control'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(production_id, async ctx => {
    const body = await request.json().catch(() => ({}))
    try {
      await pushQr(ctx.service, ctx.boardMeetingId, ctx.productionId, ctx.teamUserId, {
        preset_key: body?.preset_key,
        custom_url: body?.custom_url,
        custom_label: body?.custom_label,
        duration_seconds: body?.duration_seconds,
      })
      return NextResponse.json({ success: true })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Push QR failed')
    }
  })
}
