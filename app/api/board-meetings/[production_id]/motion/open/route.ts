import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { openMotion } from '@/lib/board-meetings/motion-control'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(production_id, async ({ service, boardMeetingId, teamUserId }) => {
    const body = await request.json()
    if (!body.motion_text?.trim()) return controlError('motion_text required')
    try {
      const motion = await openMotion(service, boardMeetingId, teamUserId, {
        agenda_item_id: body.agenda_item_id ?? null,
        consent_block: body.consent_block ?? null,
        motion_type: body.motion_type || 'main',
        parent_motion_id: body.parent_motion_id ?? null,
        motion_text: body.motion_text,
        moved_by_person_id: body.moved_by_person_id ?? null,
        seconded_by_person_id: body.seconded_by_person_id ?? null,
      })
      return NextResponse.json({ motion })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to open motion')
    }
  })
}
