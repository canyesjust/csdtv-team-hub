'use client'

import { useEffect, useState } from 'react'

export type OutlookEvent = {
  title: string
  date: string
  start_time: string | null
  end_time: string | null
  location: string | null
  all_day: boolean
}

const CACHE_KEY_PREFIX = 'csdtv-ical-events-'

function todayCacheKey(): string {
  const d = new Date()
  return `${CACHE_KEY_PREFIX}${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function readCachedEvents(): OutlookEvent[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(todayCacheKey())
    if (!raw) return null
    const parsed = JSON.parse(raw) as { events?: OutlookEvent[] }
    return Array.isArray(parsed.events) ? parsed.events : null
  } catch {
    return null
  }
}

function writeCachedEvents(events: OutlookEvent[]) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(todayCacheKey(), JSON.stringify({ events }))
  } catch {
    /* ignore quota */
  }
}

export function useOutlookEvents(enabled: boolean) {
  const [outlookEvents, setOutlookEvents] = useState<OutlookEvent[]>(() => (enabled ? readCachedEvents() || [] : []))
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setOutlookEvents([])
      return
    }

    const cached = readCachedEvents()
    if (cached) {
      setOutlookEvents(cached)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    setLoading(true)

    ;(async () => {
      try {
        const res = await fetch('/api/ical', { signal: controller.signal })
        if (!res.ok) return
        const { events: oe } = await res.json()
        const events = (oe || []) as OutlookEvent[]
        if (cancelled) return
        writeCachedEvents(events)
        setOutlookEvents(events)
      } catch {
        /* ignore iCal errors / abort */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [enabled])

  return { outlookEvents, setOutlookEvents, loadingOutlook: loading }
}
