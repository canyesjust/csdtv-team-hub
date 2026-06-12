import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'

export const dynamic = 'force-dynamic'

const VALID = new Set(['present', 'remote', 'absent', 'arrived_late', 'left_early'])

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(production_id, async ({ service, boardMeetingId }) => {
    const body = await request.json().catch(() => ({})) as { person_id?: string; status?: string }
    if (!body.person_id || !body.status || !VALID.has(body.status)) {
      return controlError('person_id and a valid status are required')
    }
    const nowIso = new Date().toISOString()
    const patch: Record<string, unknown> = { status: body.status }
    if (body.status === 'absent' || body.status === 'left_early') patch.left_at = nowIso
    if (body.status === 'arrived_late') patch.arrived_at = nowIso

    const { data: existing } = await service
      .from('meeting_attendance')
      .select('id')
      .eq('board_meeting_id', boardMeetingId)
      .eq('person_id', body.person_id)
      .maybeSingle()

    const { error } = existing
      ? await service.from('meeting_attendance').update(patch).eq('id', existing.id)
      : await service.from('meeting_attendance').insert({ board_meeting_id: boardMeetingId, person_id: body.person_id, ...patch })

    if (error) return controlError(error.message)
    return NextResponse.json({ success: true })
  })
}
