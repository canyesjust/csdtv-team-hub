'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import GraphicRenderer from '@/app/gfx/components/GraphicRenderer'
import type { MarkContext } from '@/app/gfx/components/LogoMark'
import { themeCssVars } from '@/lib/graphics/theme'
import { sortAirForRender } from '@/lib/graphics/layers'
import { resolveGfxPollMs } from '@/lib/graphics/polling'
import type { AirEntry, GraphicsOutputState } from '@/lib/graphics/types'
import '@/app/gfx/components/graphics.css'

const EMPTY_CTX: MarkContext = { schoolCode: null, awayCode: null, schools: {} }

type Payload = {
  channel: { slug: string; name: string; listening: boolean }
  state: GraphicsOutputState
}

export default function OutputClient({
  channelSlug, token, reducedMotion, safeArea, debug,
}: {
  channelSlug: string
  token: string
  reducedMotion: boolean
  safeArea: boolean
  debug: boolean
}) {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [rt, setRt] = useState<'off' | 'connecting' | 'connected' | 'error'>('off')
  const [lastSource, setLastSource] = useState<'poll' | 'push' | null>(null)
  const [scale, setScale] = useState(1)
  const [exiting, setExiting] = useState<AirEntry[]>([])
  const prevAir = useRef<AirEntry[]>([])
  const rtRef = useRef(false)
  const inflight = useRef(false)

  /** Always a FULL state read, never a partial. A browser-source refresh
   *  mid-show has to restore whatever was on air inside a second. */
  const fetchState = useCallback(async (source: 'poll' | 'push') => {
    if (inflight.current) return
    inflight.current = true
    try {
      const res = await fetch(`/api/gfx/${channelSlug}/state?k=${encodeURIComponent(token)}`, { cache: 'no-store' })
      if (res.ok) {
        setPayload(await res.json())
        setLastSource(source)
      }
    } catch {
      /* keep rendering the last state rather than blanking the show */
    } finally {
      inflight.current = false
    }
  }, [channelSlug, token])

  useEffect(() => { void fetchState('poll') }, [fetchState])

  // Realtime push, with the polling ladder underneath as the safety net.
  useEffect(() => {
    const supabase = createClient()
    setRt('connecting')
    const channel = supabase
      .channel(`gfx-output:${channelSlug}`)
      .on('broadcast', { event: 'gfx' }, () => { void fetchState('push') })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') { rtRef.current = true; setRt('connected') }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { rtRef.current = false; setRt('error') }
      })
    return () => { rtRef.current = false; void supabase.removeChannel(channel) }
  }, [channelSlug, fetchState])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = () => {
      const ms = resolveGfxPollMs({
        listening: payload?.channel.listening ?? false,
        hasShow: Boolean(payload?.state.show_id),
        live: payload?.state.state === 'live',
        realtimeConnected: rtRef.current,
      })
      timer = setTimeout(async () => { await fetchState('poll'); tick() }, ms)
    }
    tick()
    return () => { if (timer) clearTimeout(timer) }
  }, [payload, fetchState])

  // Scale the 1920x1080 stage to the browser source, whatever size it is.
  useEffect(() => {
    const resize = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080))
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  /**
   * Auto-out, computed locally.
   *
   * A row lower third carries an out_seconds. The output drops it on schedule
   * without waiting for anyone to write to the database, so it is correct even
   * if no control surface is open. The show screen sweeps as well, which keeps
   * the record straight; this keeps the picture straight.
   */
  const rawAir = useMemo(() => payload?.state.air ?? [], [payload])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!rawAir.some(a => a.out_seconds > 0)) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [rawAir])

  const air = useMemo(
    () => rawAir.filter(a => a.out_seconds <= 0 || now - Date.parse(a.taken_at) < a.out_seconds * 1000),
    [rawAir, now],
  )
  useEffect(() => {
    const current = new Set(air.map(a => `${a.layer}:${a.graphic.tid}:${JSON.stringify(a.graphic.data)}`))
    const gone = prevAir.current.filter(a => !current.has(`${a.layer}:${a.graphic.tid}:${JSON.stringify(a.graphic.data)}`))
    prevAir.current = air
    if (gone.length === 0) return
    setExiting(gone)
    const t = setTimeout(() => setExiting([]), 500)
    return () => clearTimeout(t)
  }, [air])

  const theme = payload?.state.theme
  const vars = theme ? themeCssVars(theme) : {}
  const ctx: MarkContext = EMPTY_CTX

  return (
    <div className="gx-fit" style={vars as React.CSSProperties}>
      <div
        className={`gx-stage${reducedMotion ? ' gx-nomotion' : ''}`}
        style={{
          transform: `translate(${(typeof window !== 'undefined' ? window.innerWidth : 1920) / 2 - 960 * scale}px, ${
            (typeof window !== 'undefined' ? window.innerHeight : 1080) / 2 - 540 * scale}px) scale(${scale})`,
        }}
      >
        {exiting.map(entry => (
          <div key={`out-${entry.layer}`} className="gx-out" style={{ position: 'absolute', inset: 0 }}>
            <GraphicRenderer graphic={entry.graphic} ctx={ctx} />
          </div>
        ))}
        {sortAirForRender(air).map(entry => (
          <GraphicRenderer
            key={`${entry.layer}:${entry.graphic.tid}:${entry.taken_at}`}
            graphic={entry.graphic}
            ctx={ctx}
          />
        ))}
        {safeArea && (
          <div style={{ position: 'absolute', inset: '5%', border: '2px dashed rgba(255,255,255,.25)', borderRadius: 4 }} />
        )}
      </div>

      {debug && (
        <div style={{
          position: 'fixed', left: 8, bottom: 8, zIndex: 99,
          font: '11px ui-monospace, Menlo, monospace', color: '#9ff0c6',
          background: 'rgba(0,0,0,.72)', padding: '5px 9px', borderRadius: 6,
        }}>
          {channelSlug} · realtime {rt} · last {lastSource ?? '—'} · rev {payload?.state.rev ?? 0}
          {' · '}{air.length} on air · listening {String(payload?.channel.listening)}
        </div>
      )}
    </div>
  )
}
