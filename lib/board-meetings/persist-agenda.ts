import type { SupabaseClient } from '@supabase/supabase-js'
import { syncAgendaMotions } from '@/lib/board-meetings/agenda-motions-sync'
import type { ExtractedAgendaItem, ExtractedAgendaResponse } from '@/lib/board-meetings/extraction'
import { enrichExtractedItems } from '@/lib/board-meetings/extraction'
import { parseTimeToHHMM, type PublicStartTimes } from '@/lib/board-meetings/public-start-times'

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

async function insertPresentersForItem(
  service: SupabaseClient,
  itemId: string,
  presenters: ExtractedAgendaItem['presenters'],
): Promise<void> {
  const list = presenters || []
  if (list.length === 0) return
  const { error } = await service.from('board_meeting_presenters').insert(
    list.map((p, j) => ({
      agenda_item_id: itemId,
      person_id: null,
      name: p.name,
      title: p.title ?? null,
      affiliation: p.affiliation ?? null,
      sort_order: j,
    })),
  )
  if (error) throw new Error(error.message)
}

async function insertDocumentsForItem(
  service: SupabaseClient,
  itemId: string,
  documents: ExtractedAgendaItem['documents'],
): Promise<void> {
  const list = documents || []
  if (list.length === 0) return
  const { error } = await service.from('board_meeting_agenda_documents').insert(
    list.map((d, j) => ({
      agenda_item_id: itemId,
      title: d.title,
      filename: d.filename,
      source_url: d.source_url ?? null,
      storage_path: null,
      sort_order: j,
    })),
  )
  if (error) throw new Error(error.message)
}

/** Replace all agenda items (insert new rows, then delete prior rows). */
export async function replaceAgendaItemsFromExtraction(
  service: SupabaseClient,
  boardMeetingId: string,
  extracted: ExtractedAgendaResponse,
  openedBy?: string | null,
): Promise<void> {
  const items = enrichExtractedItems(extracted)

  if (items.length === 0) {
    const { error: delErr } = await service
      .from('board_meeting_agenda_items')
      .delete()
      .eq('board_meeting_id', boardMeetingId)
    if (delErr) throw new Error(delErr.message)
    await service
      .from('board_meetings')
      .update({
        agenda_extracted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...schedulePatchFromMeeting(extracted.meeting),
        public_start_times: publicStartTimesFromExtraction(extracted),
      })
      .eq('id', boardMeetingId)
    await syncAgendaMotions(service, boardMeetingId, openedBy ?? null)
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
    suggested_motion_text: it.suggested_motion_text?.trim() || null,
  }))

  const { data: inserted, error: insErr } = await service
    .from('board_meeting_agenda_items')
    .insert(rows)
    .select('id')
  if (insErr || !inserted || inserted.length !== items.length) {
    throw new Error(insErr?.message || 'Insert agenda items failed')
  }

  const newIds = inserted.map(r => r.id)
  try {
    for (let i = 0; i < items.length; i++) {
      await insertPresentersForItem(service, newIds[i], items[i].presenters)
      await insertDocumentsForItem(service, newIds[i], items[i].documents)
    }

    const { data: existing } = await service
      .from('board_meeting_agenda_items')
      .select('id')
      .eq('board_meeting_id', boardMeetingId)

    const staleIds = (existing || []).map(r => r.id).filter(id => !newIds.includes(id))
    if (staleIds.length > 0) {
      const { error: delErr } = await service
        .from('board_meeting_agenda_items')
        .delete()
        .eq('board_meeting_id', boardMeetingId)
        .in('id', staleIds)
      if (delErr) throw new Error(delErr.message)
    }
  } catch (e) {
    if (newIds.length > 0) {
      await service.from('board_meeting_agenda_items').delete().in('id', newIds)
    }
    throw e
  }

  const { error: upErr } = await service
    .from('board_meetings')
    .update({
      agenda_extracted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...schedulePatchFromMeeting(extracted.meeting),
      public_start_times: publicStartTimesFromExtraction(extracted),
    })
    .eq('id', boardMeetingId)
  if (upErr) throw new Error(upErr.message)

  await syncAgendaMotions(service, boardMeetingId, openedBy ?? null)
}

/** Interpret date + HH:MM as America/Denver wall time, return UTC ISO. */
function combineDateAndTime(dateStr: string | undefined, timeStr: string | undefined): string | null {
  if (!dateStr || !timeStr) return null
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim())
  if (!timeMatch) return null
  const hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2])
  const [y, mo, d] = dateStr.split('-').map(Number)
  if (!y || !mo || !d) return null

  const pad = (n: number) => String(n).padStart(2, '0')
  const timeZone = 'America/Denver'
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })
  const readZoned = (ms: number) => {
    const parts = fmt.formatToParts(new Date(ms))
    const v = (t: string) => Number(parts.find(p => p.type === t)?.value || 0)
    return { y: v('year'), mo: v('month'), d: v('day'), h: v('hour'), mi: v('minute') }
  }

  let ms = Date.UTC(y, mo - 1, d, hour, minute)
  for (let i = 0; i < 4; i++) {
    const got = readZoned(ms)
    const errMin =
      (got.h - hour) * 60 +
      (got.mi - minute) +
      (got.d - d) * 24 * 60 +
      (got.mo - mo) * 24 * 60 * 31
    ms -= errMin * 60 * 1000
  }
  return new Date(ms).toISOString()
}

/**
 * Section start times for the public Watch page, read straight from the agenda
 * (AI/PDF sections carry "17:30"; the portal parser carries "5:00 pm"). Skips
 * closed / non-broadcast sections so a private closed-session time can never
 * become the public "meeting begins" label.
 */
function publicStartTimesFromExtraction(extracted: ExtractedAgendaResponse): PublicStartTimes {
  const sections: Record<string, string> = {}
  for (const s of extracted.sections || []) {
    if (s.broadcastable === false) continue
    if (/closed session/i.test(s.title || '')) continue
    const hhmm = parseTimeToHHMM(s.start_time)
    if (hhmm) sections[String(s.number)] = hhmm
  }
  return { meeting: null, sections }
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
      suggested_motion_text: it.suggested_motion_text?.trim() || null,
    })
    .select('id')
    .single()
  if (error || !row) throw new Error(error?.message || 'Insert failed')

  await insertPresentersForItem(service, row.id, it.presenters)
  await insertDocumentsForItem(service, row.id, it.documents)
}

export async function updateAgendaItemFromExtracted(
  service: SupabaseClient,
  boardMeetingId: string,
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
      notes: it.notes ?? null,
      subitems: it.subitems != null ? JSON.parse(JSON.stringify(it.subitems)) : null,
      needs_review: !!it.needs_review,
      review_notes: it.review_notes ?? null,
      suggested_motion_text: it.suggested_motion_text?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .eq('board_meeting_id', boardMeetingId)
  if (error) throw new Error(error.message)

  await service.from('board_meeting_presenters').delete().eq('agenda_item_id', itemId)
  await service.from('board_meeting_agenda_documents').delete().eq('agenda_item_id', itemId)

  await insertPresentersForItem(service, itemId, it.presenters)
  await insertDocumentsForItem(service, itemId, it.documents)
}
