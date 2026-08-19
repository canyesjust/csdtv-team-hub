'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'

/**
 * Keeps the show screen in step when more than one person has it open.
 *
 * Realtime broadcast is the fast path. A slow safety poll underneath catches a
 * dropped push, the same shape as the output page, just far less often because
 * a control surface being a second stale is not on air.
 */
export function useShowSync(channelSlug: string | null, onChange: () => void, enabled = true) {
  const handler = useRef(onChange)

  useEffect(() => {
    handler.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!enabled || !channelSlug) return
    let cancelled = false

    const supabase = createClient()
    const channel = supabase
      .channel(`gfx-output:${channelSlug}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'gfx' }, () => { if (!cancelled) handler.current() })
      .subscribe()

    const poll = setInterval(() => { if (!cancelled) handler.current() }, 15_000)

    return () => {
      cancelled = true
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [channelSlug, enabled])
}
