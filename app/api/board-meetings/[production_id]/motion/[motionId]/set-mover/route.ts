import { NextResponse } from 'next/server'
import { withMotionContext, motionError, assertMotionInMeeting } from '@/lib/board-meetings/motion-route'
import { setMotionMover } from '@/lib/board-meetings/motion-api'

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
    if (!body || !('person_id' in body)) return motionError('person_id is required')
    if (body.person_id !== null && typeof body.person_id !== 'string') {
      return motionError('person_id must be a string or null')
    }
    try {
      await setMotionMover(ctx, motionId, body.person_id ?? null)
      return NextResponse.json({ ok: true })
    } catch (e) {
      return motionError(e instanceof Error ? e.message : 'Failed to set mover')
    }
  })
}
