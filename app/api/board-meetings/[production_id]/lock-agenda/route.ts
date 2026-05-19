import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { assertBoardMeetingProduction } from '@/lib/board-meetings/meeting-api'
import { ensureBoardMeetingRow } from '@/lib/board-meetings/persist-agenda'
import { syncAgendaPresentersToPeopleLibrary } from '@/lib/board-meetings/people-import'
import {
  clearBoardMemberPeopleCache,
  getAgendaItemsForControl,
} from '@/lib/board-meetings/control-meeting-cache'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
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

  try {
    const bm = await ensureBoardMeetingRow(service, production_id)

    const { error } = await service
      .from('board_meetings')
      .update({
        agenda_locked: true,
        agenda_locked_at: new Date().toISOString(),
        agenda_locked_by: teamUser.id,
        broadcast_status: 'prepared',
        updated_at: new Date().toISOString(),
      })
      .eq('id', bm.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const peopleSync = await syncAgendaPresentersToPeopleLibrary(service, bm.id, teamUser.id)
    clearBoardMemberPeopleCache()
    await getAgendaItemsForControl(service, bm.id, true)

    return NextResponse.json({ success: true, people_sync: peopleSync })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Lock failed' },
      { status: 500 },
    )
  }
}
