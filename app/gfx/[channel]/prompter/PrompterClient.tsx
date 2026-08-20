'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { resolveSeek, PROMPTER_LINE_PX, type PrompterSeekKind } from '@/lib/graphics/prompter'
import './prompter.css'

type PrompterRow = { id: string; page: string; slug: string; script: string; ifb: string; on_air: boolean }
type PrompterState = {
  rev: number
  show_name: string | null
  rehearsal: boolean
  roll: boolean
  speed: number
  rows: PrompterRow[]
  seek: { n: number; kind: PrompterSeekKind | null; value: string | null }
  poll_ms: number
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
  const seekRef = useRef(-1)
  const pollMs = useRef(4000)

  const move = useCallback((to: number) => {
    offset.current = Math.max(0, to)
    if (innerRef.current) innerRef.current.style.transform = `translateY(${-offset.current}px)`
  }, [])

  const topOfRow = useCallback((selector: string): number | null => {
    const el = innerRef.current?.querySelector(selector) as HTMLElement | null
    return el ? el.offsetTop : null
  }, [])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/gfx/${channelSlug}/prompter?k=${encodeURIComponent(token)}`, { cache: 'no-store' })
      if (!res.ok) return
      const next = (await res.json()) as PrompterState
      if (Number.isFinite(next.poll_ms)) pollMs.current = next.poll_ms
      if (next.rev === revRef.current && next.seek?.n === seekRef.current) return
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

    // The interval re-arms itself so a change in the ladder takes effect on the
    // next tick rather than on the next mount.
    let timer: ReturnType<typeof setTimeout>
    const arm = () => { timer = setTimeout(() => { void load(); arm() }, pollMs.current) }
    arm()

    return () => { clearTimeout(first); clearTimeout(timer); supabase.removeChannel(ch) }
  }, [channelSlug, load])

  /** Snap to the on-air row whenever the cursor moves. */
  useEffect(() => {
    const top = topOfRow('.pr-line.cur')
    if (top != null) move(top)
  }, [state?.rows, topOfRow, move])

  /**
   * Apply a seek exactly once. Talent missed a line, the director presses back,
   * and the same command arriving again on the next poll must not scroll twice.
   */
  useEffect(() => {
    const seek = state?.seek
    if (!seek || !seek.n || seek.n === seekRef.current) return
    const first = seekRef.current === -1
    seekRef.current = seek.n
    if (first) return

    const target = resolveSeek(seek)
    if (!target) return
    if (target.type === 'delta') move(offset.current + target.px)
    else if (target.type === 'top') move(0)
    else if (target.type === 'air') {
      const top = topOfRow('.pr-line.cur')
      if (top != null) move(top)
    } else if (target.type === 'row') {
      const top = topOfRow(`[data-row="${CSS.escape(target.rowId)}"]`)
      if (top != null) move(top)
    }
  }, [state?.seek, move, topOfRow])

  /** Roll moves the transform only. Never re-render the DOM 30 times a second. */
  useEffect(() => {
    if (!state?.roll) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      move(offset.current + (state.speed || 1) * (PROMPTER_LINE_PX / 2) * dt)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [state?.roll, state?.speed, move])

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
              <div key={row.id} data-row={row.id}
                className={`pr-line${row.on_air ? ' cur' : ''}${airIndex >= 0 && i < airIndex ? ' past' : ''}`}>
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
