import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { assertBoardMeetingProduction, loadBoardMeetingBundle } from '@/lib/board-meetings/meeting-api'
import { insertAgendaItemTree, updateAgendaItemFromExtracted } from '@/lib/board-meetings/persist-agenda'
import type { ExtractedAgendaItem } from '@/lib/board-meetings/extraction'

export const dynamic = 'force-dynamic'

type ApplyChange = {
  change_id: string
  kind: 'added' | 'removed' | 'modified'
  after?: ExtractedAgendaItem
  before_id?: string
}

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

  const bundle = await loadBoardMeetingBundle(service, production_id)
  if (!bundle.board_meeting?.agenda_locked) {
    return NextResponse.json({ error: 'Agenda is not locked' }, { status: 400 })
  }

  const body = await request.json()
  const changes = body?.changes as ApplyChange[] | undefined
  if (!Array.isArray(changes) || changes.length === 0) {
    return NextResponse.json({ error: 'No changes to apply' }, { status: 400 })
  }

  const bmId = bundle.board_meeting.id

  try {
    for (const ch of changes) {
      if (ch.kind === 'added' && ch.after) {
        await insertAgendaItemTree(service, bmId, ch.after)
      } else if (ch.kind === 'removed' && ch.before_id) {
        await service.from('board_meeting_agenda_items').delete().eq('id', ch.before_id)
      } else if (ch.kind === 'modified' && ch.before_id && ch.after) {
        await updateAgendaItemFromExtracted(service, ch.before_id, ch.after)
      }
    }

    await service
      .from('board_meetings')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', bmId)

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Apply failed' },
      { status: 500 },
    )
  }
}
