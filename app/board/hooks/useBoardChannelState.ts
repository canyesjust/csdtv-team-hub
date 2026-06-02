'use client'

import { useEffect, useRef, useState } from 'react'
import type { PublicChannelState } from '@/lib/board-meetings/public-output-state'
import { POLL_LISTEN_CHECK_MS } from '@/lib/board-meetings/output-polling'
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

export function useBoardChannelState(channelNumber: number, _options: Options = {}) {
  const [state, setState] = useState<PublicChannelState | null>(null)
  const hasFullRef = useRef(false)
  const inflightLiveRef = useRef(false)
  const activeRef = useRef(false)
  const pollIntervalMsRef = useRef(POLL_LISTEN_CHECK_MS)
  const standbyRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    let pollTimer: ReturnType<typeof setTimeout> | null = null
    hasFullRef.current = false
    standbyRef.current = isBoardOutputStandbyMode()
    pollIntervalMsRef.current = POLL_LISTEN_CHECK_MS

    const clearPoll = () => {
      if (pollTimer !== null) {
        clearTimeout(pollTimer)
        pollTimer = null
      }
    }

    const applyPollingFromState = (data: PublicChannelState | PublicChannelLivePatch) => {
      if (data.poll_interval_ms != null && data.poll_interval_ms > 0) {
        pollIntervalMsRef.current = data.poll_interval_ms
      }
      if (data.active !== undefined) activeRef.current = data.active
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

    const scheduleNext = () => {
      clearPoll()
      if (cancelled || standbyRef.current) return

      const ms = pollIntervalMsRef.current
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

    return () => {
      cancelled = true
      clearPoll()
    }
  }, [channelNumber])

  return state
}
