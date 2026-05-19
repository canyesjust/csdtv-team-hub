import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import {
  normalizeLowerThirdPosition,
  setLowerThirdPosition,
} from '@/lib/board-meetings/lower-third-control'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(production_id, async ctx => {
    const body = await request.json().catch(() => ({}))
    const position = normalizeLowerThirdPosition(body?.position)
    try {
      await setLowerThirdPosition(ctx.service, ctx.boardMeetingId, ctx.teamUserId, position)
      return NextResponse.json({ success: true, lower_third_position: position })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to set lower third position')
    }
  })
}
