'use client'

import { useEffect, useRef, useState } from 'react'
import type { PublicChannelState } from '@/lib/board-meetings/public-output-state'
import {
  mergePublicChannelState,
  type PublicChannelLivePatch,
} from '@/lib/board-meetings/public-output-live'

const LIVE_POLL_MS = 350
const IDLE_POLL_MS = 2000

type Options = {
  /** Overlay / operator displays — poll live state aggressively. */
  livePriority?: boolean
}

export function useBoardChannelState(channelNumber: number, options: Options = {}) {
  const { livePriority = false } = options
  const [state, setState] = useState<PublicChannelState | null>(null)
  const hasFullRef = useRef(false)
  const inflightRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    hasFullRef.current = false

    const loadFull = async () => {
      try {
        const res = await fetch(`/api/board/output/${channelNumber}/state`, { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as PublicChannelState
        if (!cancelled) {
          setState(data)
          hasFullRef.current = true
        }
      } catch {
        /* ignore */
      }
    }

    const loadLive = async () => {
      if (!hasFullRef.current || inflightRef.current) return
      inflightRef.current = true
      try {
        const res = await fetch(`/api/board/output/${channelNumber}/live`, { cache: 'no-store' })
        if (!res.ok) return
        const patch = (await res.json()) as PublicChannelLivePatch
        if (!cancelled) {
          setState(prev => (prev ? mergePublicChannelState(prev, patch) : prev))
        }
      } catch {
        /* ignore */
      } finally {
        inflightRef.current = false
      }
    }

    void loadFull().then(() => {
      if (!cancelled) void loadLive()
    })
    const pollMs = livePriority ? LIVE_POLL_MS : IDLE_POLL_MS
    const interval = setInterval(() => void loadLive(), pollMs)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [channelNumber, livePriority])

  return state
}
