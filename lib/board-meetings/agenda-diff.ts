import type { ExtractedAgendaItem } from '@/lib/board-meetings/extraction'
import { agendaItemKey } from '@/lib/board-meetings/extraction'

export type StoredAgendaItem = {
  id: string
  section_number: number
  section_title: string
  item_number: string
  sort_order: number
  title: string
  original_title: string | null
  type: string
  action_requested: boolean
  is_broadcastable: boolean
  consent_block: string | null
  notes: string | null
  subitems: unknown
  needs_review: boolean
  review_notes: string | null
  suggested_motion_text?: string | null
  presenters?: { name: string; title?: string | null; affiliation?: string | null }[]
  documents?: { title: string; filename: string; source_url?: string | null }[]
}

export type AgendaDiffEntry =
  | { change_id: string; kind: 'added'; after: ExtractedAgendaItem }
  | { change_id: string; kind: 'removed'; before: StoredAgendaItem }
  | { change_id: string; kind: 'modified'; before: StoredAgendaItem; after: ExtractedAgendaItem }

function normalizePresenters(p: { name: string; title?: string | null; affiliation?: string | null }[] | undefined) {
  return (p || [])
    .map(x => ({ name: x.name, title: x.title ?? null, affiliation: x.affiliation ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function normalizeDocuments(d: { title: string; filename: string; source_url?: string | null }[] | undefined) {
  return (d || [])
    .map(x => ({ title: x.title, filename: x.filename, source_url: x.source_url ?? null }))
    .sort((a, b) => a.filename.localeCompare(b.filename))
}

function serializeForCompare(
  it: Pick<
    StoredAgendaItem,
    | 'title'
    | 'type'
    | 'is_broadcastable'
    | 'action_requested'
    | 'consent_block'
    | 'needs_review'
    | 'item_number'
    | 'section_number'
    | 'section_title'
    | 'original_title'
    | 'notes'
    | 'review_notes'
    | 'suggested_motion_text'
    | 'subitems'
  > & {
    presenters?: StoredAgendaItem['presenters']
    documents?: StoredAgendaItem['documents']
  },
): string {
  return JSON.stringify({
    title: it.title,
    type: it.type,
    is_broadcastable: it.is_broadcastable,
    action_requested: it.action_requested,
    consent_block: it.consent_block,
    needs_review: it.needs_review,
    item_number: it.item_number,
    section_number: it.section_number,
    section_title: it.section_title,
    original_title: it.original_title ?? null,
    notes: it.notes ?? null,
    review_notes: it.review_notes ?? null,
    suggested_motion_text: it.suggested_motion_text ?? null,
    subitems: it.subitems ?? null,
    presenters: normalizePresenters(it.presenters),
    documents: normalizeDocuments(it.documents),
  })
}

export function buildAgendaDiff(
  locked: StoredAgendaItem[],
  extracted: ExtractedAgendaItem[],
): AgendaDiffEntry[] {
  const oldByKey = new Map<string, StoredAgendaItem>()
  for (const row of locked) {
    oldByKey.set(agendaItemKey(row.section_number, row.item_number), row)
  }

  const diff: AgendaDiffEntry[] = []
  const seenKeys = new Set<string>()

  for (const item of extracted) {
    const key = agendaItemKey(item.section_number, item.item_number)
    seenKeys.add(key)
    const before = oldByKey.get(key)
    if (!before) {
      diff.push({ change_id: `add:${key}`, kind: 'added', after: item })
      continue
    }
    const afterCompare = {
      title: item.title,
      type: item.type,
      is_broadcastable: item.is_broadcastable !== false,
      action_requested: !!item.action_requested,
      consent_block: item.consent_block ?? null,
      needs_review: !!item.needs_review,
      item_number: item.item_number,
      section_number: item.section_number,
      section_title: item.section_title,
      original_title: item.original_title ?? null,
      notes: item.notes ?? null,
      review_notes: item.review_notes ?? null,
      suggested_motion_text: item.suggested_motion_text ?? null,
      subitems: item.subitems ?? null,
      presenters: item.presenters,
      documents: item.documents,
    }
    if (serializeForCompare(before) !== serializeForCompare(afterCompare)) {
      diff.push({ change_id: `mod:${before.id}`, kind: 'modified', before, after: item })
    }
  }

  for (const row of locked) {
    const key = agendaItemKey(row.section_number, row.item_number)
    if (!seenKeys.has(key)) {
      diff.push({ change_id: `del:${row.id}`, kind: 'removed', before: row })
    }
  }

  return diff
}
