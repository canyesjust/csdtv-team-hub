import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { updateMotion } from '@/lib/board-meetings/motion-control'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string; motionId: string }> },
) {
  const { production_id, motionId } = await params
  return withControlContext(production_id, async ({ service, boardMeetingId, teamUserId }) => {
    const body = await request.json()
    if (body.person_id !== null && (typeof body.person_id !== 'string' || !body.person_id)) {
      return controlError('person_id required')
    }
    try {
      await updateMotion(service, boardMeetingId, motionId, teamUserId, {
        moved_by_person_id: body.person_id ?? null,
      })
      return NextResponse.json({ ok: true })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to set mover')
    }
  })
}
