'use client'

import { useEffect, useRef, useState } from 'react'
import type { PublicChannelState } from '@/lib/board-meetings/public-output-state'
import { POLL_LISTEN_CHECK_MS } from '@/lib/board-meetings/output-polling'
import {
  BOARD_OUTPUT_BROADCAST_EVENT,
  boardOutputTopic,
  type BoardOutputBroadcastPayload,
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

export type BoardOutputDebugInfo = {
  realtime: 'off' | 'connecting' | 'connected' | 'error'
  lastUpdate: 'poll' | 'broadcast' | null
  lastUpdateMs: number | null
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

export function isBoardOutputDebugMode(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('debug') === 'output'
}

function readBroadcastPayload(message: unknown): BoardOutputBroadcastPayload | null {
  if (!message || typeof message !== 'object') return null
  const outer = message as { payload?: BoardOutputBroadcastPayload }
  if (outer.payload?.ts != null) return outer.payload
  const direct = message as BoardOutputBroadcastPayload
  if (direct.ts != null) return direct
  return null
}

export function useBoardChannelState(channelNumber: number, _options: Options = {}) {
  const [state, setState] = useState<PublicChannelState | null>(null)
  const [debugInfo, setDebugInfo] = useState<BoardOutputDebugInfo>({
    realtime: 'off',
    lastUpdate: null,
    lastUpdateMs: null,
  })
  const hasFullRef = useRef(false)
  const inflightLiveRef = useRef(false)
  const pendingLiveRef = useRef(false)
  const activeRef = useRef(false)
  const pollIntervalMsRef = useRef(POLL_LISTEN_CHECK_MS)
  const standbyRef = useRef(false)
  const debugEnabledRef = useRef(false)

  useEffect(() => {
    debugEnabledRef.current = isBoardOutputDebugMode()
  }, [])

  useEffect(() => {
    let cancelled = false
    let pollTimer: ReturnType<typeof setTimeout> | null = null
    hasFullRef.current = false
    standbyRef.current = isBoardOutputStandbyMode()
    pollIntervalMsRef.current = POLL_LISTEN_CHECK_MS

    const markUpdate = (source: 'poll' | 'broadcast') => {
      if (!debugEnabledRef.current) return
      setDebugInfo(prev => ({
        ...prev,
        lastUpdate: source,
        lastUpdateMs: Date.now(),
      }))
    }

    const clearPoll = () => {
      if (pollTimer !== null) {
        clearTimeout(pollTimer)
        pollTimer = null
      }
    }

    let scheduleNext: (immediate?: boolean) => void = () => {}

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

    const applyLivePatch = (patch: PublicChannelLivePatch, source: 'poll' | 'broadcast') => {
      if (!hasFullRef.current || cancelled) return
      applyPollingFromState(patch)
      setState(prev => (prev ? mergePublicChannelState(prev, patch) : prev))
      markUpdate(source)
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
          markUpdate('poll')
        }
      } catch {
        /* ignore */
      }
    }

    const loadLive = async () => {
      if (!hasFullRef.current || !activeRef.current) return
      if (inflightLiveRef.current) {
        pendingLiveRef.current = true
        return
      }
      inflightLiveRef.current = true
      try {
        const res = await fetch(`/api/board/output/${channelNumber}/live`, { cache: 'no-store' })
        if (!res.ok) return
        const patch = (await res.json()) as PublicChannelLivePatch
        if (!cancelled) {
          applyLivePatch(patch, 'poll')
        }
      } catch {
        /* ignore */
      } finally {
        inflightLiveRef.current = false
        if (pendingLiveRef.current) {
          pendingLiveRef.current = false
          void loadLive()
        }
      }
    }

    scheduleNext = (immediate = false) => {
      clearPoll()
      if (cancelled || standbyRef.current) return

      const ms = immediate ? 0 : pollIntervalMsRef.current
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
      if (debugEnabledRef.current) {
        setDebugInfo(prev => ({ ...prev, realtime: 'connecting' }))
      }

      const supabase = createClient()
      supabaseChannel = supabase
        .channel(boardOutputTopic(channelNumber))
        .on('broadcast', { event: BOARD_OUTPUT_BROADCAST_EVENT }, message => {
          const payload = readBroadcastPayload(message)
          if (payload?.patch) applyLivePatch(payload.patch, 'broadcast')
          else void loadLive().then(() => scheduleNext(true))
        })
        .subscribe(status => {
          if (cancelled) return
          if (status === 'SUBSCRIBED') {
            if (debugEnabledRef.current) {
              setDebugInfo(prev => ({ ...prev, realtime: 'connected' }))
            }
            return
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            if (debugEnabledRef.current) {
              setDebugInfo(prev => ({ ...prev, realtime: 'error' }))
            }
          }
        })
    } else if (debugEnabledRef.current) {
      setDebugInfo(prev => ({ ...prev, realtime: 'off' }))
    }

    return () => {
      cancelled = true
      clearPoll()
      pendingLiveRef.current = false
      if (supabaseChannel) {
        const supabase = createClient()
        void supabase.removeChannel(supabaseChannel)
      }
    }
  }, [channelNumber])

  return { state, debugInfo: isBoardOutputDebugMode() ? debugInfo : null }
}
