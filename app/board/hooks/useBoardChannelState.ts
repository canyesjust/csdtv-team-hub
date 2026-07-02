'use client'

import { useEffect, useRef, useState } from 'react'
import type { PublicChannelState } from '@/lib/board-meetings/public-output-state'
import { POLL_LISTEN_CHECK_MS, POLL_REALTIME_FALLBACK_MS } from '@/lib/board-meetings/output-polling'
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
  broadcastCount: number
  lastBroadcastMs: number | null
  lastPollMs: number | null
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
  const record = message as Record<string, unknown>

  const candidates: unknown[] = [record.payload, record]
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue
    const body = candidate as Record<string, unknown>
    if (typeof body.ts === 'number') {
      return body as BoardOutputBroadcastPayload
    }
    if (body.payload && typeof body.payload === 'object') {
      const nested = body.payload as Record<string, unknown>
      if (typeof nested.ts === 'number') {
        return nested as BoardOutputBroadcastPayload
      }
    }
  }
  return null
}

export function useBoardChannelState(channelNumber: number, _options: Options = {}) {
  const [state, setState] = useState<PublicChannelState | null>(null)
  const [debugInfo, setDebugInfo] = useState<BoardOutputDebugInfo>({
    realtime: 'off',
    lastUpdate: null,
    lastUpdateMs: null,
    broadcastCount: 0,
    lastBroadcastMs: null,
    lastPollMs: null,
  })
  const hasFullRef = useRef(false)
  const inflightLiveRef = useRef(false)
  const pendingLiveRef = useRef(false)
  const activeRef = useRef(false)
  const pollIntervalMsRef = useRef(POLL_LISTEN_CHECK_MS)
  const realtimeConnectedRef = useRef(false)
  const standbyRef = useRef(false)
  const debugEnabledRef = useRef(false)
  const listeningRef = useRef(false)

  useEffect(() => {
    debugEnabledRef.current = isBoardOutputDebugMode()
  }, [])

  useEffect(() => {
    let cancelled = false
    let pollTimer: ReturnType<typeof setTimeout> | null = null
    hasFullRef.current = false
    standbyRef.current = isBoardOutputStandbyMode()
    pollIntervalMsRef.current = POLL_LISTEN_CHECK_MS
    listeningRef.current = false

    const markUpdate = (source: 'poll' | 'broadcast') => {
      if (!debugEnabledRef.current) return
      const now = Date.now()
      setDebugInfo(prev => ({
        ...prev,
        lastUpdate: source,
        lastUpdateMs: now,
        ...(source === 'broadcast'
          ? { broadcastCount: prev.broadcastCount + 1, lastBroadcastMs: now }
          : { lastPollMs: now }),
      }))
    }

    // The realtime "safety poll" is a tight fallback for the LIVE path only — it catches
    // a dropped Supabase broadcast so nothing feels slow on air. It must NOT apply while
    // idle/off, or every open (but inactive) OBS source hammers /state at 1.5s instead of
    // honoring the server's 120s wake interval. Gate it on active.
    const effectivePollMs = () =>
      realtimeConnectedRef.current && activeRef.current
        ? POLL_REALTIME_FALLBACK_MS
        : pollIntervalMsRef.current

    const clearPoll = () => {
      if (pollTimer !== null) {
        clearTimeout(pollTimer)
        pollTimer = null
      }
    }

    let scheduleNext: (immediate?: boolean) => void = () => {}
    let syncRealtime: (listening: boolean) => void = () => {}

    const applyPollingFromState = (data: PublicChannelState | PublicChannelLivePatch) => {
      const becameActive = data.active === true && !activeRef.current
      if (data.active !== undefined) activeRef.current = data.active

      // Connect/disconnect Realtime as Listening flips, so idle/off outputs don't hold a
      // Supabase subscription 24/7. Detected on every poll (full or live patch).
      if (
        data.obs_polling_enabled !== undefined &&
        data.obs_polling_enabled !== listeningRef.current
      ) {
        listeningRef.current = data.obs_polling_enabled
        syncRealtime(data.obs_polling_enabled)
      }

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
        // credentials:'omit' — this endpoint uses the service-role client and never reads
        // request cookies. Omitting them strips the ~3KB Supabase session cookie that would
        // otherwise ride along on every poll (the dominant source of inbound data transfer).
        const res = await fetch(`/api/board/output/${channelNumber}/state`, {
          cache: 'no-store',
          credentials: 'omit',
        })
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

    const loadLive = async (source: 'poll' | 'broadcast' = 'poll') => {
      if (!hasFullRef.current || !activeRef.current) return
      if (inflightLiveRef.current) {
        pendingLiveRef.current = true
        return
      }
      inflightLiveRef.current = true
      try {
        const res = await fetch(`/api/board/output/${channelNumber}/live`, {
          cache: 'no-store',
          credentials: 'omit',
        })
        if (!res.ok) return
        const patch = (await res.json()) as PublicChannelLivePatch
        if (!cancelled) {
          applyLivePatch(patch, source)
        }
      } catch {
        /* ignore */
      } finally {
        inflightLiveRef.current = false
        if (pendingLiveRef.current) {
          pendingLiveRef.current = false
          void loadLive(source)
        }
      }
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

    let supabaseChannel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null

    const realtimeAvailable =
      !isBoardOutputRealtimeDisabled() &&
      !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    const disconnectRealtime = () => {
      realtimeConnectedRef.current = false
      if (supabaseChannel) {
        const supabase = createClient()
        void supabase.removeChannel(supabaseChannel)
        supabaseChannel = null
      }
      if (!cancelled && debugEnabledRef.current) {
        setDebugInfo(prev => ({ ...prev, realtime: 'off' }))
      }
    }

    const connectRealtime = () => {
      if (!realtimeAvailable || cancelled || supabaseChannel) return
      if (debugEnabledRef.current) {
        setDebugInfo(prev => ({ ...prev, realtime: 'connecting' }))
      }

      const supabase = createClient()
      supabaseChannel = supabase
        .channel(boardOutputTopic(channelNumber))
        .on('broadcast', { event: BOARD_OUTPUT_BROADCAST_EVENT }, message => {
          const payload = readBroadcastPayload(message)
          if (payload?.patch) {
            applyLivePatch(payload.patch, 'broadcast')
            scheduleNext()
            return
          }
          void loadLive('broadcast').then(() => scheduleNext())
        })
        .subscribe(status => {
          if (cancelled) return
          if (status === 'SUBSCRIBED') {
            realtimeConnectedRef.current = true
            if (hasFullRef.current && activeRef.current) scheduleNext(true)
            if (debugEnabledRef.current) {
              setDebugInfo(prev => ({ ...prev, realtime: 'connected' }))
            }
            return
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            realtimeConnectedRef.current = false
            if (hasFullRef.current && activeRef.current) scheduleNext(true)
            if (debugEnabledRef.current) {
              setDebugInfo(prev => ({
                ...prev,
                realtime: status === 'CLOSED' ? prev.realtime : 'error',
              }))
            }
          }
        })
    }

    // Only hold a Realtime subscription while the operator is driving the channel
    // (Listening on). Idle/off outputs left open in OBS drop the subscription so they
    // stop consuming Supabase Realtime connections/messages around the clock. The slow
    // /state poll (~120s) detects Listening being turned back on and reconnects.
    syncRealtime = (listening: boolean) => {
      if (!realtimeAvailable) {
        if (debugEnabledRef.current) {
          setDebugInfo(prev => ({ ...prev, realtime: 'off' }))
        }
        return
      }
      if (listening) connectRealtime()
      else disconnectRealtime()
    }

    void loadFull().then(() => {
      if (cancelled || standbyRef.current) return
      if (activeRef.current) void loadLive().then(() => scheduleNext())
      else scheduleNext()
    })

    return () => {
      cancelled = true
      realtimeConnectedRef.current = false
      clearPoll()
      pendingLiveRef.current = false
      if (supabaseChannel) {
        const supabase = createClient()
        void supabase.removeChannel(supabaseChannel)
        supabaseChannel = null
      }
    }
  }, [channelNumber])

  return { state, debugInfo: isBoardOutputDebugMode() ? debugInfo : null }
}
