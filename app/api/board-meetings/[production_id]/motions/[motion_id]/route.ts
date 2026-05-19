import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { updateMotion } from '@/lib/board-meetings/motion-control'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ production_id: string; motion_id: string }> },
) {
  const { production_id, motion_id } = await params
  return withControlContext(production_id, async ({ service, boardMeetingId, teamUserId }) => {
    const body = await request.json().catch(() => ({}))
    if (
      body.motion_text === undefined &&
      body.moved_by_person_id === undefined &&
      body.seconded_by_person_id === undefined
    ) {
      return controlError('No fields to update')
    }
    try {
      await updateMotion(service, boardMeetingId, motion_id, teamUserId, {
        motion_text: typeof body.motion_text === 'string' ? body.motion_text : undefined,
        moved_by_person_id:
          body.moved_by_person_id !== undefined ? body.moved_by_person_id || null : undefined,
        seconded_by_person_id:
          body.seconded_by_person_id !== undefined ? body.seconded_by_person_id || null : undefined,
      })
      return NextResponse.json({ ok: true })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to update motion')
    }
  })
}
