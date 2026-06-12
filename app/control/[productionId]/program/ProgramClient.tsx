'use client'

import { useEffect, useRef, useState } from 'react'
import { resolveCurrentAgendaItem } from '@/lib/board-meetings/control-meeting-cache'
import type { ControlBundle } from '@/lib/board-meetings/types'

const C = {
  bg: '#05080f', text: '#eaf1fb', soft: '#9fb2d0', dim: '#64748b',
  accent: '#4f9dee', live: '#ff5d5d', yea: '#34d399',
}

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return `${h > 0 ? h + ':' : ''}${String(m).padStart(h > 0 ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`
}

export default function ProgramClient({ productionId }: { productionId: string }) {
  const [bundle, setBundle] = useState<ControlBundle | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const stop = useRef(false)

  useEffect(() => {
    stop.current = false
    const load = async () => {
      try {
        const res = await fetch(`/api/board-meetings/${productionId}/control`, { cache: 'no-store' })
        if (res.ok) setBundle(await res.json())
      } catch { /* ignore */ }
    }
    void load()
    const poll = setInterval(() => { if (!stop.current) void load() }, 2000)
    const tick = setInterval(() => setNowMs(Date.now()), 1000)
    return () => { stop.current = true; clearInterval(poll); clearInterval(tick) }
  }, [productionId])

  const bs = bundle?.broadcast_state
  const isLive = (bs?.status || bundle?.board_meeting?.broadcast_status) === 'live'
  const current = bundle ? resolveCurrentAgendaItem(bundle.agenda_items, bs?.current_agenda_item_id, bundle.current_agenda_item) : null
  const activeLt = bundle?.lower_third_active
  const elapsedStartedAt = bs?.elapsed_started_at ?? null

  const ordered = (bundle?.agenda_items || []).filter(i => i.is_broadcastable)
  const curIdx = current ? ordered.findIndex(i => i.id === current.id) : -1
  const upNext = curIdx >= 0 ? ordered[curIdx + 1] : null

  return (
    <div style={{ position: 'fixed', inset: 0, background: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', padding: '4vh 4vw', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '1.6vw', color: C.soft }}>{bundle?.meeting?.title || 'Board Meeting'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5vw' }}>
          {isLive && <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.4vw', fontWeight: 700, color: '#ffb3b3' }}><span style={{ width: '1vw', height: '1vw', borderRadius: '50%', background: C.live }} /> LIVE</span>}
          {elapsedStartedAt && <span style={{ fontSize: '2.2vw', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtElapsed(nowMs - new Date(elapsedStartedAt).getTime())}</span>}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: '2vh' }}>
        <div style={{ fontSize: '1.6vw', color: C.accent, letterSpacing: '.08em', textTransform: 'uppercase' }}>
          {current ? `Item ${current.item_number}` : 'On air'}
        </div>
        <div style={{ fontSize: '4vw', fontWeight: 700, lineHeight: 1.1, maxWidth: '85vw' }}>
          {current ? current.title : (bundle ? 'Standing by' : 'Loading…')}
        </div>
        {current?.section_title && <div style={{ fontSize: '1.6vw', color: C.soft }}>{current.section_title}</div>}
      </div>

      {activeLt && (
        <div style={{ position: 'absolute', left: '4vw', bottom: '14vh', background: 'rgba(8,14,26,.9)', borderLeft: '0.4vw solid ' + C.accent, padding: '1.2vh 1.6vw', borderRadius: '0 0.6vw 0.6vw 0' }}>
          <div style={{ fontSize: '2.2vw', fontWeight: 700 }}>{activeLt.display_name}</div>
          {activeLt.primary_title && <div style={{ fontSize: '1.3vw', color: C.soft }}>{activeLt.primary_title}</div>}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid rgba(255,255,255,.1)', paddingTop: '2vh' }}>
        <div>
          <div style={{ fontSize: '1.1vw', color: C.dim, textTransform: 'uppercase', letterSpacing: '.08em' }}>Up next</div>
          <div style={{ fontSize: '1.8vw', fontWeight: 600 }}>{upNext ? `Item ${upNext.item_number} — ${upNext.title}` : '—'}</div>
        </div>
        <div style={{ fontSize: '1.1vw', color: C.dim }}>Monitor 2 · program</div>
      </div>
    </div>
  )
}
