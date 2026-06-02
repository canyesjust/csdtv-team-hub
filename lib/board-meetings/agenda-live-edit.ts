/** Fields operators may change from the control surface while the agenda is locked. */
export const LIVE_LOCKED_AGENDA_FIELDS = [
  'title',
  'item_number',
  'is_broadcastable',
  'type',
  'suggested_motion_text',
] as const

export function canEditAgendaWhileLocked(broadcastStatus: string | null | undefined): boolean {
  return broadcastStatus === 'prepared' || broadcastStatus === 'live'
}

export function buildLiveLockedAgendaPatch(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const field of LIVE_LOCKED_AGENDA_FIELDS) {
    if (body[field] === undefined) continue
    if (field === 'suggested_motion_text' && typeof body[field] === 'string') {
      const trimmed = body[field].trim()
      patch[field] = trimmed.length > 0 ? trimmed : null
    } else {
      patch[field] = body[field]
    }
  }
  return patch
}

export function liveLockedAgendaPatchHasChanges(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).some(k => k !== 'updated_at')
}

/**
 * Reorder only broadcastable items while preserving positions of skipped (non-broadcastable) rows.
 */
export function mergeBroadcastableReorder(
  allItems: { id: string; sort_order: number; is_broadcastable: boolean }[],
  orderedBroadcastableIds: string[],
): string[] {
  const allSorted = [...allItems].sort((a, b) => a.sort_order - b.sort_order)
  const broadcastableIds = new Set(allSorted.filter(i => i.is_broadcastable).map(i => i.id))

  if (orderedBroadcastableIds.length !== broadcastableIds.size) {
    throw new Error('ordered_ids must include every on-air agenda item exactly once')
  }
  if (!orderedBroadcastableIds.every(id => broadcastableIds.has(id))) {
    throw new Error('ordered_ids contains invalid agenda item ids')
  }

  const nonBroadcastable = allSorted.filter(i => !i.is_broadcastable)
  const result: string[] = []
  let nbIdx = 0
  let bIdx = 0

  for (const item of allSorted) {
    if (item.is_broadcastable) {
      result.push(orderedBroadcastableIds[bIdx++])
    } else {
      result.push(nonBroadcastable[nbIdx++].id)
    }
  }

  return result
}
