import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { setChannelShowIdent } from '@/lib/board-meetings/broadcast-control'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(production_id, async ctx => {
    const body = await request.json().catch(() => ({}))
    const outputChannelId = body?.output_channel_id as string | undefined
    if (!outputChannelId) return controlError('output_channel_id required')
    if (typeof body?.show !== 'boolean') return controlError('show (boolean) required')
    try {
      await setChannelShowIdent(
        ctx.service,
        ctx.boardMeetingId,
        outputChannelId,
        body.show,
        ctx.teamUserId,
      )
      return NextResponse.json({ success: true, show_channel_ident: body.show })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Update failed')
    }
  })
}
