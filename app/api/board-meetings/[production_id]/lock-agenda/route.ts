import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { assertBoardMeetingProduction } from '@/lib/board-meetings/meeting-api'
import { ensureBoardMeetingRow, replaceAgendaItemsFromExtraction } from '@/lib/board-meetings/persist-agenda'
import type { ExtractedAgendaResponse } from '@/lib/board-meetings/extraction'

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

  const body = await request.json().catch(() => ({}))
  const items = body?.items as ExtractedAgendaResponse['agenda_items'] | undefined

  try {
    const bm = await ensureBoardMeetingRow(service, production_id)

    if (items && Array.isArray(items) && items.length > 0) {
      await replaceAgendaItemsFromExtraction(service, bm.id, { agenda_items: items })
    }

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
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Lock failed' },
      { status: 500 },
    )
  }
}
