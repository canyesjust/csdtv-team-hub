import type { SupabaseClient } from '@supabase/supabase-js'

export const AGENDA_ITEM_SELECT_BASE =
  'id, item_number, title, type, section_number, section_title, sort_order, is_broadcastable, action_requested, consent_block'

export const AGENDA_ITEM_SELECT_WITH_TEMPLATE = `${AGENDA_ITEM_SELECT_BASE}, suggested_motion_text`

export type AgendaItemRow = {
  id: string
  item_number: string
  title: string
  type: string
  section_number?: number
  section_title?: string
  sort_order?: number
  is_broadcastable?: boolean
  action_requested?: boolean
  consent_block?: string | null
  suggested_motion_text?: string | null
}

export function isMissingSuggestedMotionTextColumn(error: { message?: string } | null): boolean {
  const msg = (error?.message || '').toLowerCase()
  return (
    msg.includes('suggested_motion_text') &&
    (msg.includes('does not exist') || msg.includes('column') || msg.includes('schema cache'))
  )
}

function normalizeAgendaRow(row: Record<string, unknown>): AgendaItemRow {
  return {
    id: String(row.id),
    item_number: String(row.item_number),
    title: String(row.title),
    type: String(row.type ?? ''),
    section_number: row.section_number as number | undefined,
    section_title: row.section_title as string | undefined,
    sort_order: row.sort_order as number | undefined,
    is_broadcastable: row.is_broadcastable as boolean | undefined,
    action_requested: row.action_requested as boolean | undefined,
    consent_block: (row.consent_block as string | null) ?? null,
    suggested_motion_text: (row.suggested_motion_text as string | null | undefined) ?? null,
  }
}

async function selectAgendaQuery(
  service: SupabaseClient,
  select: string,
  boardMeetingId: string,
  itemId?: string,
) {
  let q = service
    .from('board_meeting_agenda_items')
    .select(select)
    .eq('board_meeting_id', boardMeetingId)

  if (itemId) {
    q = q.eq('id', itemId)
    return q.maybeSingle()
  }

  return q.order('sort_order', { ascending: true })
}

/** Loads agenda rows; falls back if suggested_motion_text column is not migrated yet. */
export async function loadAgendaItemRows(
  service: SupabaseClient,
  boardMeetingId: string,
): Promise<AgendaItemRow[]> {
  const withTemplate = await selectAgendaQuery(
    service,
    AGENDA_ITEM_SELECT_WITH_TEMPLATE,
    boardMeetingId,
  )

  if (!withTemplate.error) {
    return ((withTemplate.data as Record<string, unknown>[]) || []).map(normalizeAgendaRow)
  }

  if (!isMissingSuggestedMotionTextColumn(withTemplate.error)) {
    throw new Error(withTemplate.error.message)
  }

  const fallback = await selectAgendaQuery(service, AGENDA_ITEM_SELECT_BASE, boardMeetingId)
  if (fallback.error) throw new Error(fallback.error.message)

  return ((fallback.data as Record<string, unknown>[]) || []).map(row =>
    normalizeAgendaRow({ ...row, suggested_motion_text: null }),
  )
}

export async function loadAgendaItemRowById(
  service: SupabaseClient,
  boardMeetingId: string,
  itemId: string,
): Promise<AgendaItemRow | null> {
  const withTemplate = await selectAgendaQuery(
    service,
    AGENDA_ITEM_SELECT_WITH_TEMPLATE,
    boardMeetingId,
    itemId,
  )

  if (!withTemplate.error) {
    const row = withTemplate.data as Record<string, unknown> | null
    return row ? normalizeAgendaRow(row) : null
  }

  if (!isMissingSuggestedMotionTextColumn(withTemplate.error)) {
    throw new Error(withTemplate.error.message)
  }

  const fallback = await selectAgendaQuery(service, AGENDA_ITEM_SELECT_BASE, boardMeetingId, itemId)
  if (fallback.error) throw new Error(fallback.error.message)

  const row = fallback.data as Record<string, unknown> | null
  return row ? normalizeAgendaRow({ ...row, suggested_motion_text: null }) : null
}
