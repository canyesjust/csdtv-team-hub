import { NextResponse } from 'next/server'
import { withBoardMeetingProduction } from '@/lib/board-meetings/production-route'
import { normalizeAgendaType } from '@/lib/board-meetings/extraction'
import { syncAgendaMotions } from '@/lib/board-meetings/agenda-motions-sync'
import { clearLockedAgendaCache } from '@/lib/board-meetings/control-meeting-cache'

export const dynamic = 'force-dynamic'

type CreateAgendaItemBody = {
  section_number?: number | string
  section_title?: string
  item_number?: string
  title?: string
  type?: string
  action_requested?: boolean
  is_broadcastable?: boolean
  notes?: string | null
  suggested_motion_text?: string | null
  /** Existing item id to insert after, or omit/null to insert at the very top. */
  insert_after_item_id?: string | null
}

// Manually add an agenda item — for sections/items an import missed, or anything
// that needs to be on the agenda before it's locked. Mirrors the DELETE route's
// locked-agenda boundary: only allowed while the agenda is still open for review.
// (Adding an item to a live/locked meeting is a separate, not-yet-built flow —
// today "pull-subitem" is the only add-like action allowed once locked.)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  return withBoardMeetingProduction(params, async ({ service, teamUser, productionId }) => {
    const { data: bm } = await service
      .from('board_meetings')
      .select('id, agenda_locked')
      .eq('production_id', productionId)
      .maybeSingle()

    if (!bm) return NextResponse.json({ error: 'Board meeting not found' }, { status: 404 })
    if (bm.agenda_locked) {
      return NextResponse.json({ error: 'Agenda is locked' }, { status: 400 })
    }

    const body = (await request.json().catch(() => ({}))) as CreateAgendaItemBody

    const title = (body.title || '').trim()
    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

    const sectionNumber = Number(body.section_number)
    if (!Number.isFinite(sectionNumber) || sectionNumber < 1) {
      return NextResponse.json({ error: 'Section number must be a positive number' }, { status: 400 })
    }

    const sectionTitle = (body.section_title || '').trim()
    if (!sectionTitle) return NextResponse.json({ error: 'Section title is required' }, { status: 400 })

    const itemNumber = (body.item_number || '').trim()
    if (!itemNumber) return NextResponse.json({ error: 'Item number is required' }, { status: 400 })

    const type = normalizeAgendaType(String(body.type || 'information'))
    const actionRequested = type === 'action' ? true : !!body.action_requested
    const isBroadcastable = body.is_broadcastable !== false
    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null
    const suggestedMotionText =
      typeof body.suggested_motion_text === 'string' && body.suggested_motion_text.trim()
        ? body.suggested_motion_text.trim()
        : null

    const { data: existing, error: loadErr } = await service
      .from('board_meeting_agenda_items')
      .select('id, sort_order')
      .eq('board_meeting_id', bm.id)
      .order('sort_order', { ascending: true })
    if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })

    const ordered = (existing || []) as { id: string; sort_order: number }[]

    let insertAtSortOrder = 0
    if (body.insert_after_item_id) {
      const after = ordered.find(r => r.id === body.insert_after_item_id)
      if (!after) return NextResponse.json({ error: 'insert_after_item_id not found' }, { status: 400 })
      insertAtSortOrder = after.sort_order + 1
    }

    // Make room: shift everything at or after the insertion point down by one.
    // Uses the sort_order values captured above, so it's safe regardless of
    // update order (no unique constraint on sort_order to race against).
    for (const row of ordered) {
      if (row.sort_order >= insertAtSortOrder) {
        await service
          .from('board_meeting_agenda_items')
          .update({ sort_order: row.sort_order + 1, updated_at: new Date().toISOString() })
          .eq('id', row.id)
      }
    }

    const { data: created, error: insErr } = await service
      .from('board_meeting_agenda_items')
      .insert({
        board_meeting_id: bm.id,
        section_number: sectionNumber,
        section_title: sectionTitle,
        item_number: itemNumber,
        sort_order: insertAtSortOrder,
        title,
        original_title: title,
        type,
        action_requested: actionRequested,
        is_broadcastable: isBroadcastable,
        consent_block: null,
        notes,
        needs_review: false,
        suggested_motion_text: suggestedMotionText,
      })
      .select('id')
      .single()

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

    clearLockedAgendaCache(bm.id)
    await syncAgendaMotions(service, bm.id, teamUser.id)

    return NextResponse.json({ success: true, id: created!.id })
  })
}
