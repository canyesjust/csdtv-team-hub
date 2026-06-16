import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { assertBoardMeetingProduction } from '@/lib/board-meetings/meeting-api'

export const dynamic = 'force-dynamic'

// Clear the extracted agenda items (but keep the board meeting) so the operator can
// re-import from scratch. Blocked once the agenda is locked.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { production_id } = await params
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const prodCheck = await assertBoardMeetingProduction(service, production_id)
  if ('error' in prodCheck) {
    return NextResponse.json({ error: prodCheck.error }, { status: prodCheck.status || 400 })
  }

  const { data: bm } = await service
    .from('board_meetings')
    .select('id, agenda_locked')
    .eq('production_id', production_id)
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
}
