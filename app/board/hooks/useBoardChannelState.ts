'use client'

import { useEffect, useRef, useState } from 'react'
import type { PublicChannelState } from '@/lib/board-meetings/public-output-state'
import { POLL_LISTEN_CHECK_MS, POLL_REALTIME_FALLBACK_MS } from '@/lib/board-meetings/output-polling'
import {
  BOARD_OUTPUT_BROADCAST_EVENT,
  boardOutputTopic,
} from '@/lib/board-meetings/output-realtime'
import { createClient } from '@/lib/supabase'
import {
  mergePublicChannelState,
  type PublicChannelLivePatch,
} from '@/lib/board-meetings/public-output-live'

type Options = {
  /** @deprecated Server chooses interval from view_type; kept for call-site compatibility. */
  livePriority?: boolean
}

/** Legacy escape hatch: no recurring polls (use dashboard Listening toggle instead). */
export function isBoardOutputStandbyMode(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.get('standby') === '1' || params.get('poll') === '0'
}

export function isBoardOutputRealtimeDisabled(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.get('realtime') === '0'
}

export function useBoardChannelState(channelNumber: number, _options: Options = {}) {
  const [state, setState] = useState<PublicChannelState | null>(null)
  const hasFullRef = useRef(false)
  const inflightLiveRef = useRef(false)
  const activeRef = useRef(false)
  const pollIntervalMsRef = useRef(POLL_LISTEN_CHECK_MS)
  const standbyRef = useRef(false)
  const realtimeConnectedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    let pollTimer: ReturnType<typeof setTimeout> | null = null
    let realtimeDebounce: ReturnType<typeof setTimeout> | null = null
    hasFullRef.current = false
    standbyRef.current = isBoardOutputStandbyMode()
    pollIntervalMsRef.current = POLL_LISTEN_CHECK_MS

    const clearPoll = () => {
      if (pollTimer !== null) {
        clearTimeout(pollTimer)
        pollTimer = null
      }
    }

    let scheduleNext: (immediate?: boolean) => void = () => {}

    const effectivePollMs = () => {
      if (realtimeConnectedRef.current && activeRef.current) return POLL_REALTIME_FALLBACK_MS
      return pollIntervalMsRef.current
    }

    const applyPollingFromState = (data: PublicChannelState | PublicChannelLivePatch) => {
      const becameActive = data.active === true && !activeRef.current
      if (data.active !== undefined) activeRef.current = data.active

      const nextInterval = data.poll_interval_ms
      if (nextInterval != null && nextInterval > 0) {
        const prevInterval = pollIntervalMsRef.current
        pollIntervalMsRef.current = nextInterval
        if (
          hasFullRef.current &&
          activeRef.current &&
          !standbyRef.current &&
          (becameActive || nextInterval < prevInterval)
        ) {
          scheduleNext(true)
        }
      }
    }

    const loadFull = async () => {
      try {
        const res = await fetch(`/api/board/output/${channelNumber}/state`, { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as PublicChannelState
        if (!cancelled) {
          applyPollingFromState(data)
          setState(data)
          hasFullRef.current = true
        }
      } catch {
        /* ignore */
      }
    }

    const loadLive = async () => {
      if (!hasFullRef.current || inflightLiveRef.current || !activeRef.current) return
      inflightLiveRef.current = true
      try {
        const res = await fetch(`/api/board/output/${channelNumber}/live`, { cache: 'no-store' })
        if (!res.ok) return
        const patch = (await res.json()) as PublicChannelLivePatch
        if (!cancelled) {
          applyPollingFromState(patch)
          setState(prev => (prev ? mergePublicChannelState(prev, patch) : prev))
        }
      } catch {
        /* ignore */
      } finally {
        inflightLiveRef.current = false
      }
    }

    const scheduleLiveRefresh = () => {
      if (realtimeDebounce) clearTimeout(realtimeDebounce)
      realtimeDebounce = setTimeout(() => {
        void loadLive().then(() => scheduleNext(true))
      }, 25)
    }

    scheduleNext = (immediate = false) => {
      clearPoll()
      if (cancelled || standbyRef.current) return

      const ms = immediate ? 0 : effectivePollMs()
      if (!hasFullRef.current) {
        pollTimer = setTimeout(() => {
          void loadFull().then(() => scheduleNext())
        }, 0)
        return
      }

      if (!activeRef.current) {
        pollTimer = setTimeout(() => {
          void loadFull().then(() => scheduleNext())
        }, ms)
        return
      }

      pollTimer = setTimeout(() => {
        void loadLive().then(() => scheduleNext())
      }, ms)
    }

    void loadFull().then(() => {
      if (cancelled || standbyRef.current) return
      if (activeRef.current) void loadLive().then(() => scheduleNext())
      else scheduleNext()
    })

    let supabaseChannel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null
    if (
      !isBoardOutputRealtimeDisabled() &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      const supabase = createClient()
      supabaseChannel = supabase
        .channel(boardOutputTopic(channelNumber))
        .on('broadcast', { event: BOARD_OUTPUT_BROADCAST_EVENT }, () => {
          scheduleLiveRefresh()
        })
        .subscribe(status => {
          if (cancelled) return
          const connected = status === 'SUBSCRIBED'
          realtimeConnectedRef.current = connected
          if (connected) scheduleLiveRefresh()
          else scheduleNext(true)
        })
    }

    return () => {
      cancelled = true
      clearPoll()
      if (realtimeDebounce) clearTimeout(realtimeDebounce)
      realtimeConnectedRef.current = false
      if (supabaseChannel) {
        const supabase = createClient()
        void supabase.removeChannel(supabaseChannel)
      }
    }
  }, [channelNumber])

  return state
}
