import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withBoardMeetingProduction } from '@/lib/board-meetings/production-route'
import { loadBoardMeetingBundle } from '@/lib/board-meetings/meeting-api'
import { insertAgendaItemTree, updateAgendaItemFromExtracted } from '@/lib/board-meetings/persist-agenda'
import type { ExtractedAgendaItem } from '@/lib/board-meetings/extraction'
import { clearLockedAgendaCache } from '@/lib/board-meetings/control-meeting-cache'

export const dynamic = 'force-dynamic'

type ApplyChange = {
  change_id: string
  kind: 'added' | 'removed' | 'modified'
  after?: ExtractedAgendaItem
  before_id?: string
}

async function assertItemsBelongToMeeting(
  service: SupabaseClient,
  boardMeetingId: string,
  itemIds: string[],
): Promise<void> {
  if (itemIds.length === 0) return
  const unique = [...new Set(itemIds)]
  const { data, error } = await service
    .from('board_meeting_agenda_items')
    .select('id')
    .eq('board_meeting_id', boardMeetingId)
    .in('id', unique)
  if (error) throw new Error(error.message)
  if ((data || []).length !== unique.length) {
    throw new Error('One or more agenda items do not belong to this meeting')
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  return withBoardMeetingProduction(params, async ({ service, productionId }) => {
    const bundle = await loadBoardMeetingBundle(service, productionId)
    if (!bundle.board_meeting?.agenda_locked) {
      return NextResponse.json({ error: 'Agenda is not locked' }, { status: 400 })
    }

    const body = await request.json()
    const changes = body?.changes as ApplyChange[] | undefined
    if (!Array.isArray(changes) || changes.length === 0) {
      return NextResponse.json({ error: 'No changes to apply' }, { status: 400 })
    }

    const bmId = bundle.board_meeting.id

    const beforeIds = changes
      .filter(ch => (ch.kind === 'removed' || ch.kind === 'modified') && ch.before_id)
      .map(ch => ch.before_id as string)

    try {
      await assertItemsBelongToMeeting(service, bmId, beforeIds)

      for (const ch of changes) {
        if (ch.kind === 'added' && ch.after) {
          await insertAgendaItemTree(service, bmId, ch.after)
        } else if (ch.kind === 'removed' && ch.before_id) {
          const { error } = await service
            .from('board_meeting_agenda_items')
            .delete()
            .eq('id', ch.before_id)
            .eq('board_meeting_id', bmId)
          if (error) throw new Error(error.message)
        } else if (ch.kind === 'modified' && ch.before_id && ch.after) {
          await updateAgendaItemFromExtracted(service, bmId, ch.before_id, ch.after)
        }
      }

      await service
        .from('board_meetings')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', bmId)

      clearLockedAgendaCache(bmId)

      return NextResponse.json({ success: true })
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Apply failed' },
        { status: 500 },
      )
    }
  })
}
