'use client'

import { useEffect, useRef, useState } from 'react'
import type { PublicChannelState } from '@/lib/board-meetings/public-output-state'
import {
  mergePublicChannelState,
  type PublicChannelLivePatch,
} from '@/lib/board-meetings/public-output-live'

/** When a meeting is live on this channel (overlay / operator). */
const LIVE_POLL_MS = 350
/** Assigned meeting but not in live-priority mode. */
const IDLE_POLL_MS = 2000
/** No meeting assigned — check occasionally for assignment / go-live. */
const AWAKE_POLL_MS = 60_000

type Options = {
  /** Overlay / operator displays — poll live state aggressively when a meeting is active. */
  livePriority?: boolean
}

/** OBS/browser sources: add ?standby=1 (or ?poll=0) to stop recurring API requests until go-live. */
export function isBoardOutputStandbyMode(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.get('standby') === '1' || params.get('poll') === '0'
}

export function useBoardChannelState(channelNumber: number, options: Options = {}) {
  const { livePriority = false } = options
  const [state, setState] = useState<PublicChannelState | null>(null)
  const hasFullRef = useRef(false)
  const inflightLiveRef = useRef(false)
  const activeRef = useRef(false)
  const standbyRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    let pollTimer: ReturnType<typeof setTimeout> | null = null
    hasFullRef.current = false
    standbyRef.current = isBoardOutputStandbyMode()

    const clearPoll = () => {
      if (pollTimer !== null) {
        clearTimeout(pollTimer)
        pollTimer = null
      }
    }

    const loadFull = async () => {
      try {
        const res = await fetch(`/api/board/output/${channelNumber}/state`, { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as PublicChannelState
        if (!cancelled) {
          activeRef.current = data.active
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
          if (patch.active !== undefined) activeRef.current = patch.active
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

      if (!hasFullRef.current) {
        pollTimer = setTimeout(() => {
          void loadFull().then(() => scheduleNext())
        }, 0)
        return
      }

      if (!activeRef.current) {
        pollTimer = setTimeout(() => {
          void loadFull().then(() => scheduleNext())
        }, AWAKE_POLL_MS)
        return
      }

      const ms = livePriority ? LIVE_POLL_MS : IDLE_POLL_MS
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
  }, [channelNumber, livePriority])

  return state
}
