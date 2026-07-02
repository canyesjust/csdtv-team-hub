import { NextResponse } from 'next/server'
import { withBoardMeetingProduction } from '@/lib/board-meetings/production-route'

export const dynamic = 'force-dynamic'

// Clear the extracted agenda items (but keep the board meeting) so the operator can
// re-import from scratch. Blocked once the agenda is locked.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  return withBoardMeetingProduction(params, async ({ service, productionId }) => {
    const { data: bm } = await service
      .from('board_meetings')
      .select('id, agenda_locked')
      .eq('production_id', productionId)
      .maybeSingle()
    if (!bm) return NextResponse.json({ error: 'Board meeting not found' }, { status: 404 })
    if (bm.agenda_locked) {
      return NextResponse.json({ error: 'Agenda is locked. Unlock it before clearing.' }, { status: 400 })
    }

    // Agenda items cascade to presenters + documents on delete.
    const { error } = await service
      .from('board_meeting_agenda_items')
      .delete()
      .eq('board_meeting_id', bm.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await service
      .from('board_meetings')
      .update({ agenda_extracted_at: null, updated_at: new Date().toISOString() })
      .eq('id', bm.id)

    return NextResponse.json({ success: true })
  })
}
