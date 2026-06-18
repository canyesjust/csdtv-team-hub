'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/lib/toast'
import BoardPreview from './BoardPreview'
import type { ControlBundle } from '@/lib/board-meetings/types'

const C = {
  bg: '#0a0f1a', panel: '#111a2b', panel2: '#16223a',
  line: 'rgba(255,255,255,.08)', line2: 'rgba(255,255,255,.14)',
  text: '#eaf1fb', soft: '#9fb2d0', dim: '#8a9cbb',
  accent: '#4f9dee', accentbg: 'rgba(79,157,238,.16)',
  amber: '#fbbf24', amberbg: 'rgba(251,191,36,.15)',
  yea: '#34d399', yeabg: 'rgba(52,211,153,.16)', gold: '#e7b549',
}

type PlaylistItem = {
  id: string
  item_type: string
  label: string
  duration_seconds: number | null
  info_card_config: Record<string, unknown> | null
  sort_order: number
}

type Takeover = { active: boolean; mode: 'preroll' | 'live' | null; board_channel_number: number | null } | null

type Props = {
  productionId: string
  bundle: ControlBundle
  canControl: boolean
  busy: boolean
  onAction: (action: string, body?: unknown) => Promise<void>
  onMarkStreamStarted?: (clear: boolean) => void | Promise<void>
  /** Switch the console to the live/agenda view (after gavel or resume). */
  onLeavePreshow?: () => void
}

const btn: React.CSSProperties = { font: 'inherit', fontSize: 13, padding: '8px 13px', borderRadius: 9, border: `1px solid ${C.line2}`, background: 'transparent', color: C.text, cursor: 'pointer' }
const card: React.CSSProperties = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 13, marginBottom: 12 }
const h3: React.CSSProperties = { fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: C.accent, fontWeight: 700, margin: '0 0 10px' }

function Step({ state, label, sub }: { state: 'done' | 'now' | 'todo'; label: string; sub: string }) {
  const bg = state === 'done' ? C.yea : state === 'now' ? C.amber : 'transparent'
  const fg = state === 'todo' ? C.dim : '#06101f'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderLeft: `1px solid ${C.line}` }}>
      <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: bg, color: fg, border: state === 'todo' ? `1px solid ${C.line2}` : 'none' }}>{state === 'done' ? '✓' : state === 'now' ? '●' : ' '}</span>
      <div><div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div><div style={{ fontSize: 11, color: C.soft }}>{sub}</div></div>
    </div>
  )
}

export default function PreshowMode({ productionId, bundle, canControl, busy, onAction, onMarkStreamStarted, onLeavePreshow }: Props) {
  const bs = bundle.broadcast_state
  const status = bs?.status || bundle.board_meeting.broadcast_status
  const isLive = status === 'live'
  const mode = bs?.mode || 'normal'
  const onBreak = isLive && mode === 'recess'
  const playback = bundle.playlist_state?.playback_state || 'idle'
  const currentItemId = bundle.playlist_state?.current_item_id ?? null
  const heldItemId = bundle.playlist_state?.held_item_id ?? null
  const streamStarted = bundle.board_meeting.stream_started_at

  const assignedId = bundle.channel_assignments?.[0]?.output_channel_id
  const boardCh = bundle.channels?.find(c => c.id === assignedId)?.channel_number ?? null

  const [items, setItems] = useState<PlaylistItem[]>([])
  const [takeover, setTakeover] = useState<Takeover>(null)
  const [takeoverBlocked, setTakeoverBlocked] = useState(false)

  const loadItems = useCallback(async () => {
    try {
      const res = await fetch(`/api/board-meetings/${productionId}/playlist`, { cache: 'no-store' })
      if (res.ok) { const b = await res.json(); setItems(b.items || []) }
    } catch { /* ignore */ }
  }, [productionId])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/board-meetings/${productionId}/playlist`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then(b => { if (!cancelled) setItems(b.items || []) })
      .catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [productionId, playback, currentItemId])

  useEffect(() => {
    let stop = false
    const load = async () => {
      try {
        const res = await fetch('/api/signage/board-takeover', { cache: 'no-store' })
        if (res.status === 401 || res.status === 403) { setTakeoverBlocked(true); return }
        if (res.ok) { const b = await res.json(); setTakeover(b.takeover ?? null) }
      } catch { /* ignore */ }
    }
    void load()
    const id = setInterval(() => { if (!stop) void load() }, 5000)
    return () => { stop = true; clearInterval(id) }
  }, [])

  const playlistAct = (a: string, body?: unknown) => onAction(`playlist-${a}`, body)

  const toggleFullscreen = async (it: PlaylistItem) => {
    const cfg = { ...(it.info_card_config || {}), full_screen: !(it.info_card_config?.full_screen) }
    await fetch(`/api/board-meetings/${productionId}/playlist/items/${it.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ info_card_config: cfg }),
    })
    void loadItems()
  }

  const setTakeoverMode = async (action: 'preroll' | 'live' | 'off') => {
    if (action !== 'off' && !boardCh) { toast('No board channel is assigned to this meeting.', 'error'); return }
    const res = await fetch('/api/signage/board-takeover', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, board_channel_number: boardCh, label: bundle.meeting?.title }),
    })
    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      toast((b as { error?: string }).error || 'Signage takeover failed', 'error')
    } else {
      setTakeover(action === 'off' ? { active: false, mode: null, board_channel_number: boardCh } : { active: true, mode: action, board_channel_number: boardCh })
    }
  }

  const takeoverMode = takeover?.active ? takeover.mode : 'off'

  // Launch steps
  const stepStream = !!streamStarted
  const stepScreens = takeoverMode === 'preroll' || takeoverMode === 'live'
  const stepPlaying = playback === 'playing'

  return (
    <div>
      {/* LAUNCH SEQUENCE */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '9px 16px', borderBottom: `1px solid ${C.line}`, background: '#0b1322', flexWrap: 'wrap' }}>
        {onBreak ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#fde3a7' }}>On break — between sessions</span>
            <span style={{ fontSize: 12, color: C.soft }}>screens holding on pre-roll until you resume</span>
          </div>
        ) : (
          <>
            <Step state={stepStream ? 'done' : 'now'} label="Stream started" sub={streamStarted ? new Date(streamStarted).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' · video 0:00' : 'tap when YouTube goes live'} />
            <Step state={stepScreens ? 'done' : stepStream ? 'now' : 'todo'} label="Screens on pre-roll" sub={takeoverMode === 'preroll' ? 'following' : takeoverMode === 'live' ? 'on live stream' : 'not taken over'} />
            <Step state={stepPlaying ? 'now' : 'todo'} label="Pre-roll playing" sub={playback} />
            <Step state="todo" label="Gavel" sub="when the board is seated" />
          </>
        )}
        <div style={{ flex: 1, minWidth: 10 }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!streamStarted && !onBreak && (
            <button style={{ ...btn }} disabled={!onMarkStreamStarted} onClick={() => onMarkStreamStarted?.(false)}>Stream started</button>
          )}
          <button style={{ background: C.gold, color: '#1a1305', border: 'none', borderRadius: 10, padding: '11px 16px', font: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' }} disabled={!canControl || takeoverMode === 'live'} onClick={() => setTakeoverMode('live')}>
            Switch screens → stream
          </button>
          {onBreak ? (
            <button style={{ background: C.accent, color: '#06101f', border: 'none', borderRadius: 10, padding: '11px 18px', font: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} disabled={!canControl || busy} onClick={() => { void onAction('clear-mode'); onLeavePreshow?.() }}>Resume meeting</button>
          ) : (
            <button style={{ background: C.accent, color: '#06101f', border: 'none', borderRadius: 10, padding: '11px 18px', font: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} disabled={!canControl || busy} onClick={() => { void onAction('end-preroll'); onLeavePreshow?.() }}>Go live (gavel)</button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0,1fr) 320px' }}>
        {/* PLAYLIST */}
        <div style={{ padding: 12, minHeight: 480 }}>
          <div style={{ ...h3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Pre-roll playlist</span>
            <a href={`/dashboard/productions/${bundle.meeting?.production_number ?? ''}?tab=boardmeeting`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: C.accent, textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>Edit ↗</a>
          </div>
          {items.length === 0 && <div style={{ fontSize: 12, color: C.dim }}>No playlist items. Add them on the Board Meeting tab.</div>}
          {items.map(it => {
            const cur = it.id === currentItemId
            const held = it.id === heldItemId
            const fs = !!it.info_card_config?.full_screen
            return (
              <div key={it.id}
                style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 8px', borderRadius: 8, border: `1px solid ${cur ? 'rgba(79,157,238,.5)' : C.line}`, background: cur ? C.accentbg : C.panel, marginBottom: 5 }}>
                <span style={{ width: 42, height: 26, borderRadius: 4, background: C.panel2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: C.soft, flexShrink: 0, textTransform: 'uppercase' }}>{it.item_type.replace('info_card_', '').slice(0, 6)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {it.label}
                    {cur && <span style={{ fontSize: 11, color: '#bcdcff', marginLeft: 5 }}>on now</span>}
                    {held && <span style={{ fontSize: 11, color: '#fde3a7', marginLeft: 5 }}>held</span>}
                  </div>
                  <div style={{ fontSize: 11, color: C.dim }}>{it.duration_seconds ? `${it.duration_seconds}s` : 'auto'}</div>
                </div>
                <button onClick={e => { e.stopPropagation(); void toggleFullscreen(it) }} title="Full-screen this item"
                  style={{ font: 'inherit', fontSize: 12, padding: '2px 6px', borderRadius: 6, border: 'none', background: fs ? C.amberbg : 'transparent', color: fs ? '#fde3a7' : C.dim, cursor: 'pointer' }}>⛶</button>
              </div>
            )
          })}
        </div>

        {/* PREVIEWS + TRANSPORT */}
        <div style={{ padding: 12, borderLeft: `1px solid ${C.line}`, borderRight: `1px solid ${C.line}`, minHeight: 480 }}>
          <div style={{ ...h3 }}>What&apos;s showing right now</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <BoardPreview channel={boardCh} view="preroll" label="District screens / stream" />
            <BoardPreview channel={boardCh} view="dais" label="Dais display (always meeting view)" />
          </div>

          <div style={{ display: 'flex', gap: 7, marginTop: 12, alignItems: 'center' }}>
            {heldItemId
              ? <button style={{ ...btn, flex: 1, background: C.accent, color: '#06101f', border: 'none', fontWeight: 700 }} disabled={!canControl} onClick={() => playlistAct('release-hold')}>▶ Resume playlist</button>
              : <button style={{ ...btn, flex: 1, fontWeight: 600 }} disabled={!canControl} onClick={() => playlistAct('hold')}>⏸ Hold on this item</button>}
          </div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 8, lineHeight: 1.5 }}>The pre-roll plays and loops on its own. <b style={{ color: C.soft }}>Hold</b> freezes the current item on screen; <b style={{ color: C.soft }}>Resume</b> continues the loop. ⛶ marks an item full-screen. {onBreak ? 'Resume the meeting from the launch bar when the next session begins.' : 'The dais always shows the meeting view, even when the public screens are on pre-roll.'}</div>
        </div>

        {/* SIGNAGE + CHECKLIST */}
        <div style={{ padding: 12, minHeight: 480 }}>
          <div style={{ ...h3 }}>Signage takeover</div>
          <div style={card}>
            <h3 style={h3}>District screens</h3>
            {takeoverBlocked ? (
              <div style={{ fontSize: 12, color: C.soft, lineHeight: 1.5 }}>You don&apos;t have signage manager access — takeover is controlled from the Signage admin.</div>
            ) : (
              <>
                <div style={{ display: 'flex', border: `1px solid ${C.line2}`, borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
                  {(['preroll', 'live', 'off'] as const).map((m, i) => {
                    const on = takeoverMode === m
                    return (
                      <button key={m} disabled={!canControl} onClick={() => setTakeoverMode(m)}
                        style={{ font: 'inherit', flex: 1, fontSize: 12, padding: '8px 0', border: 'none', borderLeft: i ? `1px solid ${C.line}` : 'none', cursor: 'pointer', textTransform: 'capitalize', background: on ? C.accentbg : 'transparent', color: on ? '#bcdcff' : C.soft, fontWeight: on ? 600 : 400 }}>
                        {m === 'preroll' ? 'Pre-roll' : m === 'live' ? 'Live' : 'Off'}
                      </button>
                    )
                  })}
                </div>
                <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.5 }}>
                  {takeoverMode === 'preroll' && 'District screens are showing the pre-roll.'}
                  {takeoverMode === 'live' && 'District screens are on the live YouTube stream.'}
                  {takeoverMode === 'off' && 'District screens are on normal signage.'}
                  {' '}Ending the meeting returns them to normal. Per-screen opt-in and audio are set in Signage admin.
                </div>
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
