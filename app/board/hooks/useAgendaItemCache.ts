'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { PublicAgendaItem, PublicAgendaItemSummary } from '@/lib/board-meetings/public-output-state'

function summaryToPartial(summary: PublicAgendaItemSummary): PublicAgendaItem {
  return {
    id: summary.id,
    section_number: 0,
    section_title: '',
    item_number: summary.item_number,
    title: summary.title,
    type: summary.type,
    presenters: [],
    documents: [],
  }
}

/**
 * Loads the full broadcastable agenda once per active meeting and keeps it in memory
 * so live polls can swap items instantly without waiting for presenters/documents.
 */
export function useAgendaItemCache(
  channelNumber: number,
  active: boolean,
  seedItems: (PublicAgendaItem | null | undefined)[] = [],
  meetingKey?: string | number | null,
) {
  const cacheRef = useRef<Map<string, PublicAgendaItem>>(new Map())
  const loadedKeyRef = useRef<string | null>(null)

  useEffect(() => {
    for (const item of seedItems) {
      if (item?.id) cacheRef.current.set(item.id, item)
    }
  }, [seedItems])

  useEffect(() => {
    if (!active) {
      cacheRef.current.clear()
      loadedKeyRef.current = null
      return
    }

    const fetchKey = meetingKey != null ? `${channelNumber}:${meetingKey}` : `${channelNumber}`
    if (loadedKeyRef.current === fetchKey) return

    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/board/output/${channelNumber}/agenda-items`, { cache: 'no-store' })
        if (!res.ok || cancelled) return
        const body = (await res.json()) as { items?: PublicAgendaItem[] }
        for (const item of body.items || []) {
          if (item?.id) cacheRef.current.set(item.id, item)
        }
        if (!cancelled) loadedKeyRef.current = fetchKey
      } catch {
        /* ignore — live polls still work with partial data */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [channelNumber, active, meetingKey])

  const resolveItem = useCallback((item: PublicAgendaItem | null | undefined): PublicAgendaItem | null => {
    if (!item) return null
    const cached = cacheRef.current.get(item.id)
    if (!cached) return item
    return {
      ...cached,
      ...item,
      presenters: cached.presenters?.length ? cached.presenters : item.presenters,
      documents: cached.documents?.length ? cached.documents : item.documents,
    }
  }, [])

  const resolveSummary = useCallback(
    (summary: PublicAgendaItemSummary): PublicAgendaItem => {
      return resolveItem(summaryToPartial(summary)) ?? summaryToPartial(summary)
    },
    [resolveItem],
  )

  return { resolveItem, resolveSummary, cacheRef }
}
