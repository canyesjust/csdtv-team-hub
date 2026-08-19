'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { ShowBundle } from '@/lib/graphics/show-data'

/**
 * How often the control surface checks in when nothing pushed.
 *
 * This is the board-meeting ladder applied to a control surface. Realtime
 * broadcast is the fast path and the poll is only a safety net for a dropped
 * push, so the intervals are as slow as the moment allows:
 *
 *   live, realtime connected   4s    a missed take is the only thing at stake
 *   live, realtime down        1.2s  now the poll IS the transport
 *   not live                   30s   nobody is on air, nothing is urgent
 *   editing right now          off   your own typing is the freshest truth
 */
export const SHOW_POLL_LIVE_MS = 4_000
export const SHOW_POLL_LIVE_NO_RT_MS = 1_200
export const SHOW_POLL_IDLE_MS = 30_000

export function resolveShowPollMs(args: { live: boolean; realtimeConnected: boolean }): number {
  if (!args.live) return SHOW_POLL_IDLE_MS
  return args.realtimeConnected ? SHOW_POLL_LIVE_MS : SHOW_POLL_LIVE_NO_RT_MS
}

/**
 * Keeps the show screen in step without ever re-rendering the server component.
 *
 * `router.refresh()` re-runs the page, re-serialises the tree and reconciles
 * the whole screen. Doing that on every keystroke is what made this lag. This
 * fetches one JSON document instead and patches state.
 */
export function useShowState(showId: string, initial: ShowBundle) {
  const [bundle, setBundle] = useState<ShowBundle>(initial)
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const inFlight = useRef(false)
  const paused = useRef(false)

  /** True while the operator is typing, so a refetch cannot yank the field. */
  const setPaused = useCallback((value: boolean) => { paused.current = value }, [])

  const pull = useCallback(async (force = false) => {
    if (inFlight.current) return
    if (paused.current && !force) return
    inFlight.current = true
    try {
      const res = await fetch(`/api/gfx/shows/${showId}/state`, { cache: 'no-store' })
      if (!res.ok) return
      const next = (await res.json()) as ShowBundle
      if (next?.show?.id) setBundle(next)
    } catch {
      /* the next tick tries again */
    } finally {
      inFlight.current = false
    }
  }, [showId])

  const channelSlug = bundle.show.channel?.slug ?? null
  const live = bundle.show.state === 'live'

  useEffect(() => {
    if (!channelSlug) { setRealtimeConnected(false); return }
    let cancelled = false
    const supabase = createClient()
    const channel = supabase
      .channel(`gfx-output:${channelSlug}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'gfx' }, () => { if (!cancelled) void pull() })
      .subscribe(status => { if (!cancelled) setRealtimeConnected(status === 'SUBSCRIBED') })

    return () => {
      cancelled = true
      setRealtimeConnected(false)
      supabase.removeChannel(channel)
    }
  }, [channelSlug, pull])

  useEffect(() => {
    const every = resolveShowPollMs({ live, realtimeConnected })
    const id = setInterval(() => { void pull() }, every)
    return () => clearInterval(id)
  }, [live, realtimeConnected, pull])

  return { bundle, setBundle, refresh: pull, setPaused, realtimeConnected }
}
