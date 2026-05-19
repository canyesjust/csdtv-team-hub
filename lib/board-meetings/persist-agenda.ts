import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExtractedAgendaItem, ExtractedAgendaResponse } from '@/lib/board-meetings/extraction'
import { enrichExtractedItems } from '@/lib/board-meetings/extraction'

export async function ensureBoardMeetingRow(
  service: SupabaseClient,
  productionId: string,
): Promise<{ id: string }> {
  const { data: existing } = await service
    .from('board_meetings')
    .select('id')
    .eq('production_id', productionId)
    .maybeSingle()
  if (existing) return existing

  const { data: created, error } = await service
    .from('board_meetings')
    .insert({ production_id: productionId })
    .select('id')
    .single()
  if (error || !created) throw new Error(error?.message || 'Could not create board meeting')
  return created
}

/** Replace all agenda items (cascade deletes presenters/documents). */
export async function replaceAgendaItemsFromExtraction(
  service: SupabaseClient,
  boardMeetingId: string,
  extracted: ExtractedAgendaResponse,
): Promise<void> {
  const items = enrichExtractedItems(extracted)

  const { error: delErr } = await service
    .from('board_meeting_agenda_items')
    .delete()
    .eq('board_meeting_id', boardMeetingId)
  if (delErr) throw new Error(delErr.message)

  if (items.length === 0) {
    await service
      .from('board_meetings')
      .update({
        agenda_extracted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...schedulePatchFromMeeting(extracted.meeting),
      })
      .eq('id', boardMeetingId)
    return
  }

  const rows = items.map(it => ({
    board_meeting_id: boardMeetingId,
    section_number: it.section_number,
    section_title: it.section_title,
    item_number: it.item_number,
    sort_order: it.sort_order,
    title: it.title,
    original_title: it.original_title ?? null,
    type: it.type,
    action_requested: !!it.action_requested,
    is_broadcastable: it.is_broadcastable !== false,
    consent_block: it.consent_block ?? null,
    notes: it.notes ?? null,
    subitems: it.subitems != null ? JSON.parse(JSON.stringify(it.subitems)) : null,
    needs_review: !!it.needs_review,
    review_notes: it.review_notes ?? null,
  }))

  const { data: inserted, error: insErr } = await service
    .from('board_meeting_agenda_items')
    .insert(rows)
    .select('id')
  if (insErr || !inserted || inserted.length !== items.length) {
    throw new Error(insErr?.message || 'Insert agenda items failed')
  }

  for (let i = 0; i < items.length; i++) {
    const itemId = inserted[i].id
    const it = items[i]
    const presenters = it.presenters || []
    if (presenters.length > 0) {
      const { error: pErr } = await service.from('board_meeting_presenters').insert(
        presenters.map((p, j) => ({
          agenda_item_id: itemId,
          person_id: null,
          name: p.name,
          title: p.title ?? null,
          sort_order: j,
        })),
      )
      if (pErr) throw new Error(pErr.message)
    }
    const documents = it.documents || []
    if (documents.length > 0) {
      const { error: dErr } = await service.from('board_meeting_agenda_documents').insert(
        documents.map((d, j) => ({
          agenda_item_id: itemId,
          title: d.title,
          filename: d.filename,
          source_url: d.source_url ?? null,
          storage_path: null,
          sort_order: j,
        })),
      )
      if (dErr) throw new Error(dErr.message)
    }
  }

  const { error: upErr } = await service
    .from('board_meetings')
    .update({
      agenda_extracted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...schedulePatchFromMeeting(extracted.meeting),
    })
    .eq('id', boardMeetingId)
  if (upErr) throw new Error(upErr.message)
}

function combineDateAndTime(dateStr: string | undefined, timeStr: string | undefined): string | null {
  if (!dateStr || !timeStr) return null
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim())
  if (!timeMatch) return null
  const hours = Number(timeMatch[1])
  const minutes = Number(timeMatch[2])
  const base = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(base.getTime())) return null
  base.setHours(hours, minutes, 0, 0)
  return base.toISOString()
}

function schedulePatchFromMeeting(meeting: ExtractedAgendaResponse['meeting'] | undefined): Record<string, string | null> {
  if (!meeting) return {}
  const out: Record<string, string | null> = {}

  const publicStart =
    combineDateAndTime(meeting.date, meeting.scheduled_public_start ?? undefined) ||
    (meeting.scheduled_public_start && /^\d{4}-\d{2}-\d{2}/.test(meeting.scheduled_public_start)
      ? new Date(meeting.scheduled_public_start).toISOString()
      : null)
  if (publicStart) out.scheduled_public_start = publicStart

  const closedStart =
    combineDateAndTime(meeting.date, meeting.closed_session_start ?? undefined) ||
    (meeting.closed_session_start && /^\d{4}-\d{2}-\d{2}/.test(meeting.closed_session_start)
      ? new Date(meeting.closed_session_start).toISOString()
      : null)
  if (closedStart) out.closed_session_start = closedStart

  return out
}

/** Insert one agenda item + children from extraction shape */
export async function insertAgendaItemTree(
  service: SupabaseClient,
  boardMeetingId: string,
  it: ExtractedAgendaItem,
): Promise<void> {
  const { data: row, error } = await service
    .from('board_meeting_agenda_items')
    .insert({
      board_meeting_id: boardMeetingId,
      section_number: it.section_number,
      section_title: it.section_title,
      item_number: it.item_number,
      sort_order: it.sort_order,
      title: it.title,
      original_title: it.original_title ?? null,
      type: it.type,
      action_requested: !!it.action_requested,
      is_broadcastable: it.is_broadcastable !== false,
      consent_block: it.consent_block ?? null,
      notes: it.notes ?? null,
      subitems: it.subitems != null ? JSON.parse(JSON.stringify(it.subitems)) : null,
      needs_review: !!it.needs_review,
      review_notes: it.review_notes ?? null,
    })
    .select('id')
    .single()
  if (error || !row) throw new Error(error?.message || 'Insert failed')

  const presenters = it.presenters || []
  if (presenters.length > 0) {
    await service.from('board_meeting_presenters').insert(
      presenters.map((p, j) => ({
        agenda_item_id: row.id,
        person_id: null,
        name: p.name,
        title: p.title ?? null,
        sort_order: j,
      })),
    )
  }
  const documents = it.documents || []
  if (documents.length > 0) {
    await service.from('board_meeting_agenda_documents').insert(
      documents.map((d, j) => ({
        agenda_item_id: row.id,
        title: d.title,
        filename: d.filename,
        source_url: d.source_url ?? null,
        storage_path: null,
        sort_order: j,
      })),
    )
  }
}

export async function updateAgendaItemFromExtracted(
  service: SupabaseClient,
  itemId: string,
  it: ExtractedAgendaItem,
): Promise<void> {
  const { error } = await service
    .from('board_meeting_agenda_items')
    .update({
      section_number: it.section_number,
      section_title: it.section_title,
      item_number: it.item_number,
      sort_order: it.sort_order,
      title: it.title,
      original_title: it.original_title ?? null,
      type: it.type,
      action_requested: !!it.action_requested,
      is_broadcastable: it.is_broadcastable !== false,
      consent_block: it.consent_block ?? null,
      subitems: it.subitems != null ? JSON.parse(JSON.stringify(it.subitems)) : null,
      needs_review: !!it.needs_review,
      review_notes: it.review_notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
  if (error) throw new Error(error.message)

  await service.from('board_meeting_presenters').delete().eq('agenda_item_id', itemId)
  await service.from('board_meeting_agenda_documents').delete().eq('agenda_item_id', itemId)

  const presenters = it.presenters || []
  if (presenters.length > 0) {
    await service.from('board_meeting_presenters').insert(
      presenters.map((p, j) => ({
        agenda_item_id: itemId,
        person_id: null,
        name: p.name,
        title: p.title ?? null,
        sort_order: j,
      })),
    )
  }
  const documents = it.documents || []
  if (documents.length > 0) {
    await service.from('board_meeting_agenda_documents').insert(
      documents.map((d, j) => ({
        agenda_item_id: itemId,
        title: d.title,
        filename: d.filename,
        source_url: d.source_url ?? null,
        storage_path: null,
        sort_order: j,
      })),
    )
  }
}
