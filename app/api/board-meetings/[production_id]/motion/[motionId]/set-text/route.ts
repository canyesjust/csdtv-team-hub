import { NextResponse } from 'next/server'
import { withMotionContext, motionError, assertMotionInMeeting } from '@/lib/board-meetings/motion-route'
import { setMotionText } from '@/lib/board-meetings/motion-api'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string; motionId: string }> },
) {
  const { production_id, motionId } = await params
  return withMotionContext(production_id, async ctx => {
    if (!(await assertMotionInMeeting(ctx.service, motionId, ctx.boardMeetingId))) {
      return motionError('Motion not found', 404)
    }
    const body = await request.json().catch(() => null)
    const text = typeof body?.text === 'string' ? body.text : typeof body?.motion_text === 'string' ? body.motion_text : ''
    if (!text.trim()) return motionError('text is required')
    try {
      await setMotionText(ctx, motionId, text)
      return NextResponse.json({ ok: true })
    } catch (e) {
      return motionError(e instanceof Error ? e.message : 'Failed to set motion text')
    }
  })
}
