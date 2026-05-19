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
}

export type AgendaDiffEntry =
  | { change_id: string; kind: 'added'; after: ExtractedAgendaItem }
  | { change_id: string; kind: 'removed'; before: StoredAgendaItem }
  | { change_id: string; kind: 'modified'; before: StoredAgendaItem; after: ExtractedAgendaItem }

function serializeForCompare(it: Pick<StoredAgendaItem, 'title' | 'type' | 'is_broadcastable' | 'action_requested' | 'consent_block' | 'needs_review' | 'item_number' | 'section_number'>): string {
  return JSON.stringify({
    title: it.title,
    type: it.type,
    is_broadcastable: it.is_broadcastable,
    action_requested: it.action_requested,
    consent_block: it.consent_block,
    needs_review: it.needs_review,
    item_number: it.item_number,
    section_number: it.section_number,
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
    if (serializeForCompare(before) !== serializeForCompare({
      title : item.title,
      type : item.type,
      is_broadcastable : item.is_broadcastable !== false,
      action_requested : !!item.action_requested,
      consent_block : item.consent_block ?? null,
      needs_review : !!item.needs_review,
      item_number : item.item_number,
      section_number : item.section_number,
    }) || (before.original_title || '') !== (item.original_title || '')) {
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
