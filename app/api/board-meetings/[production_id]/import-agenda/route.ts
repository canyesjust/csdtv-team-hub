import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isStaffOrManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { assertBoardMeetingProduction } from '@/lib/board-meetings/meeting-api'
import { ensureBoardMeetingRow, replaceAgendaItemsFromExtraction } from '@/lib/board-meetings/persist-agenda'
import { enrichExtractedItems } from '@/lib/board-meetings/extraction'
import { resolveIcompassMeeting, importIcompassAgenda } from '@/lib/board-meetings/icompass-agenda'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Import an agenda straight from the iCompass / Diligent Community portal.
// Unlike the PDF upload, NO AI touches the items — titles are persisted exactly
// as listed on the agenda. We only parse the portal's structured HTML.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaffOrManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { production_id } = await params
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const prodCheck = await assertBoardMeetingProduction(service, production_id)
  if ('error' in prodCheck) {
    return NextResponse.json({ error: prodCheck.error }, { status: prodCheck.status || 400 })
  }

  const body = (await request.json().catch(() => ({}))) as { meeting?: string }
  const resolved = resolveIcompassMeeting(String(body.meeting ?? ''))
  if (!resolved) {
    return NextResponse.json({ error: 'Enter the meeting ID or the agenda URL from the portal.' }, { status: 400 })
  }

  try {
    const extracted = await importIcompassAgenda(resolved.baseUrl, resolved.meetingId)
    if (!extracted || extracted.agenda_items.length === 0) {
      return NextResponse.json({ error: 'Could not read an agenda for that meeting. Check the ID or URL.' }, { status: 400 })
    }

    const bm = await ensureBoardMeetingRow(service, production_id)
    if (bm.id) {
      const { data: lockedRow } = await service
        .from('board_meetings')
        .select('agenda_locked')
        .eq('id', bm.id)
        .single()
      if (lockedRow?.agenda_locked) {
        return NextResponse.json({ error: 'Agenda is locked. Use re-upload instead.' }, { status: 400 })
      }
    }

    await replaceAgendaItemsFromExtraction(service, bm.id, extracted, teamUser.id)
    // Remember the meeting id so the tab can pre-fill it next time.
    if (bm.id) {
      await service.from('board_meetings').update({ icompass_meeting_id: resolved.meetingId }).eq('id', bm.id)
    }
    const items = enrichExtractedItems(extracted)

    return NextResponse.json({ extracted, items, board_meeting_id: bm.id, source: 'icompass', meeting_id: resolved.meetingId })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Import failed' }, { status: 500 })
  }
}
