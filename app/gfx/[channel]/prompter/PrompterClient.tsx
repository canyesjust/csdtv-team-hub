'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import './prompter.css'

type PrompterRow = { id: string; page: string; slug: string; script: string; ifb: string; on_air: boolean }
type PrompterState = {
  rev: number
  show_name: string | null
  rehearsal: boolean
  roll: boolean
  speed: number
  rows: PrompterRow[]
}

/**
 * White on black, all of it, with lines already read dimmed. IFB notes render
 * red and are never read aloud, which is the convention.
 */
export default function PrompterClient({ channelSlug, token }: { channelSlug: string; token: string }) {
  const [state, setState] = useState<PrompterState | null>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const offset = useRef(0)
  const revRef = useRef(-1)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/gfx/${channelSlug}/prompter?k=${encodeURIComponent(token)}`, { cache: 'no-store' })
      if (!res.ok) return
      const next = (await res.json()) as PrompterState
      if (next.rev === revRef.current) return
      revRef.current = next.rev
      setState(next)
    } catch { /* the poll will retry */ }
  }, [channelSlug, token])

  useEffect(() => {
    // Kick the first fetch off the render pass, then subscribe. Push is the
    // fast path; the poll only catches a dropped broadcast.
    const first = setTimeout(() => void load(), 0)
    const supabase = createClient()
    const ch = supabase.channel(`gfx-output:${channelSlug}`)
      .on('broadcast', { event: 'gfx' }, () => void load())
      .subscribe()
    const poll = setInterval(() => void load(), 4000)
    return () => { clearTimeout(first); clearInterval(poll); supabase.removeChannel(ch) }
  }, [channelSlug, load])

  /** Snap to the on-air row whenever the cursor moves. */
  useEffect(() => {
    const el = innerRef.current?.querySelector('.pr-line.cur') as HTMLElement | null
    if (el) {
      offset.current = el.offsetTop
      if (innerRef.current) innerRef.current.style.transform = `translateY(${-offset.current}px)`
    }
  }, [state?.rows])

  /** Roll moves the transform only. Never re-render the DOM 30 times a second. */
  useEffect(() => {
    if (!state?.roll) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      offset.current += (state.speed || 1) * 48 * dt
      if (innerRef.current) innerRef.current.style.transform = `translateY(${-offset.current}px)`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [state?.roll, state?.speed])

  const airIndex = state?.rows.findIndex(r => r.on_air) ?? -1

  return (
    <div className="pr-root">
      {state?.rehearsal && <div className="pr-rehearsal">Rehearsal</div>}
      <div className="pr-cue" />
      <div className="pr-scroll">
        <div className="pr-inner" ref={innerRef}>
          {!state || state.rows.length === 0 ? (
            <div className="pr-line">No scripts on this rundown yet.</div>
          ) : (
            state.rows.map((row, i) => (
              <div key={row.id} className={`pr-line${row.on_air ? ' cur' : ''}${airIndex >= 0 && i < airIndex ? ' past' : ''}`}>
                <span className="pr-slug">{row.page} · {row.slug}</span>
                {row.script}
                {row.ifb && <span className="pr-ifb">{row.ifb}</span>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
