import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { extendQr } from '@/lib/board-meetings/qr-control'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(production_id, async ctx => {
    const body = await request.json().catch(() => ({}))
    const additional = Number(body?.additional_seconds)
    if (!Number.isFinite(additional) || additional < 1) {
      return controlError('additional_seconds required')
    }
    try {
      await extendQr(ctx.service, ctx.boardMeetingId, ctx.teamUserId, additional)
      return NextResponse.json({ success: true })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Extend QR failed')
    }
  })
}
