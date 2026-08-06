import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { setAgendaBrandingHold } from '@/lib/board-meetings/broadcast-control'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(production_id, async ctx => {
    const body = await request.json().catch(() => ({}))
    // Defaults to true (show the branding slide) to match the standalone
    // "Agenda branding" button, which posts no body. Pass { hold: false } to
    // clear it — used by the per-item "Remove from overlay" toggle, so an
    // item can come off the on-air graphic without being skipped from the
    // broadcastable agenda or the public site.
    const hold = typeof body?.hold === 'boolean' ? body.hold : true
    try {
      await setAgendaBrandingHold(ctx.service, ctx.boardMeetingId, ctx.teamUserId, hold)
      return NextResponse.json({ success: true, agenda_branding_hold: hold })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to update branding slide')
    }
  })
}
