'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from '@/lib/toast'

type Item = {
  id: string
  label: string
  title: string
  auto_offset_seconds: number | null
  override_seconds: number | null
}

// Minimal YouTube IFrame API surface we use.
type YTPlayer = {
  getCurrentTime: () => number
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  destroy: () => void
}
type YTNamespace = { Player: new (el: HTMLElement, opts: unknown) => YTPlayer }
type YTWindow = Window & { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void }

function fmt(total: number | null): string {
  if (total == null) return ''
  const s = Math.max(0, Math.floor(total))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}
function parseTimecode(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  if (/^\d+$/.test(t)) return Number(t)
  const parts = t.split(':').map(p => p.trim())
  if (parts.some(p => !/^\d+$/.test(p))) return null
  const nums = parts.map(Number)
  if (nums.length === 2) return nums[0] * 60 + nums[1]
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2]
  return null
}
function youtubeId(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/(?:v=|youtu\.be\/|\/live\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

function loadYT(): Promise<YTNamespace> {
  return new Promise(resolve => {
    const w = window as YTWindow
    if (w.YT && w.YT.Player) { resolve(w.YT); return }
    if (!document.getElementById('yt-iframe-api')) {
      const s = document.createElement('script')
      s.id = 'yt-iframe-api'
      s.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(s)
    }
    const iv = setInterval(() => {
      const win = window as YTWindow
      if (win.YT && win.YT.Player) { clearInterval(iv); resolve(win.YT) }
    }, 150)
  })
}

export default function EditTimestampsButton({ productionId }: { productionId: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [ytId, setYtId] = useState<string | null>(null)
  const [playerTime, setPlayerTime] = useState(0)
  const [savingId, setSavingId] = useState<string | null>(null)

  const playerRef = useRef<YTPlayer | null>(null)
  const mountRef = useRef<HTMLDivElement | null>(null)

  const openEditor = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/board-meetings/${productionId}/agenda-timestamps`)
      const body = await res.json()
      if (!res.ok) { toast(body.error || 'Could not load timestamps', 'error'); return }
      setItems(body.items || [])
      setYtId(youtubeId(body.youtube_url))
      setOpen(true)
    } finally {
      setLoading(false)
    }
  }

  // Spin up the YouTube player while the editor is open, and poll its time.
  useEffect(() => {
    if (!open || !ytId || !mountRef.current) return
    let cancelled = false
    let interval: ReturnType<typeof setInterval> | null = null
    void loadYT().then(YT => {
      if (cancelled || !mountRef.current) return
      playerRef.current = new YT.Player(mountRef.current, {
        videoId: ytId,
        playerVars: { rel: 0, modestbranding: 1 },
      })
      interval = setInterval(() => {
        try {
          const t = playerRef.current?.getCurrentTime?.()
          if (typeof t === 'number') setPlayerTime(t)
        } catch { /* player not ready yet */ }
      }, 400)
    })
    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
      try { playerRef.current?.destroy?.() } catch { /* ignore */ }
      playerRef.current = null
    }
  }, [open, ytId])

  const save = useCallback(async (itemId: string, value: number | null) => {
    setSavingId(itemId)
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, override_seconds: value } : it))
    try {
      const res = await fetch(`/api/board-meetings/${productionId}/agenda-timestamps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, offset_seconds: value }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        toast(b.error || 'Save failed', 'error')
      }
    } catch {
      toast('Save failed', 'error')
    } finally {
      setSavingId(null)
    }
  }, [productionId])

  const effective = (it: Item): number | null => it.override_seconds ?? it.auto_offset_seconds
  const nowSec = Math.floor(playerTime)

  // Which item the playhead currently sits in (greatest effective offset <= now).
  let nearestId: string | null = null
  let best = -1
  for (const it of items) {
    const e = effective(it)
    if (e != null && e <= nowSec && e > best) { best = e; nearestId = it.id }
  }

  const C = {
    card: 'var(--surface-1)', line: 'var(--border-subtle)', text: 'var(--text-primary)',
    muted: 'var(--text-muted)', s2: 'var(--surface-2)', brand: 'var(--brand-primary)',
  }
  const smallBtn: React.CSSProperties = {
    fontSize: 12, padding: '5px 9px', borderRadius: 7, border: `0.5px solid ${C.line}`,
    background: C.s2, color: C.text, cursor: 'pointer', fontFamily: 'inherit',
  }

  return (
    <>
      <button
        type="button"
        onClick={openEditor}
        disabled={loading}
        style={{ fontSize: 14, padding: '10px 16px', minHeight: 44, borderRadius: 10, border: `0.5px solid ${C.line}`, background: C.card, color: C.text, fontWeight: 600, cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit' }}
      >
        {loading ? 'Loading…' : 'Edit agenda timestamps'}
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, padding: 22, width: 'min(900px, 100%)', maxHeight: '88vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <h3 style={{ margin: 0, color: C.text }}>Edit agenda timestamps</h3>
              <button type="button" onClick={() => setOpen(false)} style={smallBtn}>Close</button>
            </div>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
              These set the “jump to this point” times on the public agenda. Scrub the recording, then “Set to here” on the matching item — or type an exact time / nudge it.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: ytId ? 'minmax(0,1.05fr) minmax(0,1fr)' : '1fr', gap: 16, alignItems: 'start' }}>
              {ytId && (
                <div>
                  <div style={{ position: 'relative', aspectRatio: '16/9', background: '#000', borderRadius: 10, overflow: 'hidden' }}>
                    <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, background: C.s2, borderRadius: 8, padding: '10px 12px' }}>
                    <span style={{ fontSize: 12, color: C.muted }}>Player is at</span>
                    <span style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: C.text }}>{fmt(nowSec)}</span>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {!ytId && (
                  <p style={{ margin: '0 0 4px', fontSize: 12.5, color: '#b45309', lineHeight: 1.5 }}>
                    No recording URL is set on this meeting yet, so the video grab isn’t available. You can still type or nudge times.
                  </p>
                )}
                {items.length === 0 && <p style={{ fontSize: 13, color: C.muted }}>No broadcastable agenda items.</p>}
                {items.map(it => {
                  const eff = effective(it)
                  const isOverride = it.override_seconds != null
                  const draft = drafts[it.id] ?? (eff != null ? fmt(eff) : '')
                  const here = nearestId === it.id
                  return (
                    <div key={it.id} style={{ border: here ? `2px solid ${C.brand}` : `0.5px solid ${C.line}`, borderRadius: 9, padding: '9px 10px', background: here ? 'var(--surface-2)' : 'transparent' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.muted, minWidth: 22 }}>{it.label}</span>
                        <span style={{ fontSize: 13, lineHeight: 1.3, color: C.text }}>{it.title}</span>
                        {isOverride && <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 600, color: C.brand, textTransform: 'uppercase', letterSpacing: '.04em' }}>edited</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
                        <input
                          value={draft}
                          disabled={savingId === it.id}
                          onChange={e => setDrafts(d => ({ ...d, [it.id]: e.target.value }))}
                          onBlur={() => {
                            const v = parseTimecode(drafts[it.id] ?? '')
                            setDrafts(d => { const n = { ...d }; delete n[it.id]; return n })
                            if ((drafts[it.id] ?? '') !== '' && v != null && v !== eff) void save(it.id, v)
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                          placeholder={it.auto_offset_seconds != null ? fmt(it.auto_offset_seconds) : '—:—'}
                          style={{ width: 70, textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontFamily: 'ui-monospace, monospace', fontSize: 13, padding: '6px 7px', borderRadius: 7, border: `0.5px solid ${C.line}`, background: C.card, color: C.text }}
                        />
                        <button type="button" style={smallBtn} disabled={savingId === it.id || eff == null} onClick={() => save(it.id, Math.max(0, (eff ?? 0) - 5))}>−5s</button>
                        <button type="button" style={smallBtn} disabled={savingId === it.id || eff == null} onClick={() => save(it.id, (eff ?? 0) + 5)}>+5s</button>
                        {ytId && (
                          <button type="button" style={{ ...smallBtn, background: C.brand, color: '#fff', border: 'none', fontWeight: 600 }} disabled={savingId === it.id} onClick={() => save(it.id, nowSec)}>Set to {fmt(nowSec)}</button>
                        )}
                        {ytId && eff != null && (
                          <button type="button" style={smallBtn} title="Jump the video here" disabled={savingId === it.id} onClick={() => { try { playerRef.current?.seekTo(eff, true) } catch { /* ignore */ } }}>▶</button>
                        )}
                        {isOverride && (
                          <button type="button" style={{ ...smallBtn, marginLeft: 'auto' }} title="Revert to the auto-detected time" disabled={savingId === it.id} onClick={() => save(it.id, null)}>Reset</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
