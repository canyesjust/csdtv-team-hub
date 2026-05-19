import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { openMotion } from '@/lib/board-meetings/motion-control'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string; motionId: string }> },
) {
  const { production_id, motionId: parentMotionId } = await params
  return withControlContext(production_id, async ({ service, boardMeetingId, teamUserId }) => {
    const body = await request.json().catch(() => ({}))
    const motionText =
      typeof body.motion_text === 'string' && body.motion_text.trim()
        ? body.motion_text.trim()
        : 'I move to substitute the following motion'
    try {
      const motion = await openMotion(service, boardMeetingId, teamUserId, {
        motion_type: 'substitute',
        parent_motion_id: parentMotionId,
        motion_text: motionText,
      })
      return NextResponse.json({ motion })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to propose substitute')
    }
  })
}
