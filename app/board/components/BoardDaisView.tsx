'use client'

import { useEffect, useMemo, useState } from 'react'
import type { PublicChannelState } from '@/lib/board-meetings/public-output-state'
import { formatOffsetSeconds } from '@/lib/board-meetings/time-format'

const LS_KEY = 'board-dais-person'

export default function BoardDaisView({ channelNumber }: { channelNumber: number }) {
  const [state, setState] = useState<PublicChannelState | null>(null)
  const [personName, setPersonName] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [boardMembers, setBoardMembers] = useState<{ id: string; display_name: string }[]>([])

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null
    if (saved) setPersonName(saved)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/board/output/${channelNumber}/state`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setState(data)
      } catch { /* ignore */ }
    }
    load()
    const t = setInterval(load, 2000)
    return () => { cancelled = true; clearInterval(t) }
  }, [channelNumber])

  const elapsed = useMemo(() => {
    if (!state?.live_started_at) return 0
    return Math.max(0, Math.floor((Date.now() - new Date(state.live_started_at).getTime()) / 1000))
  }, [state?.live_started_at, state])

  const openPicker = async () => {
    setPickerOpen(true)
    if (boardMembers.length > 0) return
    try {
      const res = await fetch('/api/board/public/board-members')
      if (!res.ok) return
      const body = await res.json()
      setBoardMembers((body.members || []).map((p: { id: string; display_name: string }) => ({ id: p.id, display_name: p.display_name })))
    } catch { /* ignore */ }
  }

  const selectPerson = (name: string) => {
    localStorage.setItem(LS_KEY, name)
    setPersonName(name)
    setPickerOpen(false)
  }

  if (!state?.active) {
    return (
      <div style={root}>
        <p style={{ color: '#94a3b8', fontSize: '24px' }}>No production active</p>
      </div>
    )
  }

  const item = state.current_item
  const timer = state.timer
  const mode = state.state?.mode

  return (
    <div style={root}>
      <div style={{ position: 'absolute', top: 16, right: 16, fontSize: '14px', color: '#94a3b8' }}>
        {personName ? (
          <span>Welcome, {personName}</span>
        ) : (
          <button type="button" onClick={openPicker} style={linkBtn}>This is my monitor</button>
        )}
      </div>

      {pickerOpen && (
        <div style={pickerOverlay}>
          <div style={pickerCard}>
            <p style={{ margin: '0 0 12px', fontWeight: 600, color: '#fff' }}>Select board member</p>
            {boardMembers.map(m => (
              <button key={m.id} type="button" onClick={() => selectPerson(m.display_name)} style={pickerItem}>
                {m.display_name}
              </button>
            ))}
            <button type="button" onClick={() => setPickerOpen(false)} style={{ ...pickerItem, marginTop: '8px', opacity: 0.7 }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '32px', flex: 1, alignItems: 'stretch' }}>
        <div>
          <p style={{ margin: '0 0 8px', fontSize: '16px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {state.meeting?.title}
          </p>
          {mode === 'recess' ? (
            <h1 style={{ margin: 0, fontSize: '48px', color: '#60a5fa' }}>Recess</h1>
          ) : mode === 'technical_difficulties' ? (
            <h1 style={{ margin: 0, fontSize: '48px', color: '#f87171' }}>Technical difficulties</h1>
          ) : item ? (
            <>
              <p style={{ margin: '0 0 12px', fontSize: '28px', color: '#60a5fa', fontWeight: 700 }}>{item.item_number}</p>
              <h1 style={{ margin: '0 0 16px', fontSize: '42px', lineHeight: 1.15, fontWeight: 700 }}>{item.title}</h1>
              {item.presenters?.[0] && (
                <p style={{ margin: '0 0 20px', fontSize: '24px', color: '#cbd5e1' }}>
                  {item.presenters[0].name}
                  {item.presenters[0].title ? ` — ${item.presenters[0].title}` : ''}
                </p>
              )}
              {state.state?.active_vote_result && (state.state.active_vote_result.remaining_seconds ?? 0) > 0 ? (
                <div style={{ marginBottom: '20px', padding: '16px', borderRadius: '12px', background: state.state.active_vote_result.result === 'passed' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)', border: '2px solid rgba(255,255,255,0.2)' }}>
                  <p style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 800, textTransform: 'uppercase' }}>
                    {state.state.active_vote_result.result === 'passed' ? 'Motion passed' : 'Motion failed'} {state.state.active_vote_result.tally.yea}–{state.state.active_vote_result.tally.nay}
                  </p>
                  <p style={{ margin: 0, fontSize: '18px', color: '#e2e8f0' }}>{state.state.active_vote_result.motion_text}</p>
                </div>
              ) : state.state?.active_motion ? (
                <div style={{ marginBottom: '20px', padding: '16px', borderRadius: '12px', background: 'rgba(245,158,11,0.15)', border: '2px solid rgba(251,191,36,0.4)' }}>
                  <p style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase' }}>Motion on floor</p>
                  <p style={{ margin: '0 0 8px', fontSize: '22px', color: '#f8fafc' }}>{state.state.active_motion.motion_text}</p>
                  <p style={{ margin: 0, fontSize: '16px', color: '#94a3b8' }}>{state.state.active_motion.moved_by_name} · {state.state.active_motion.seconded_by_name}</p>
                </div>
              ) : null}
              {(item.documents?.length ?? 0) > 0 && (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: '18px', color: '#94a3b8' }}>
                  {item.documents.map((d, i) => (
                    <li key={i} style={{ marginBottom: '6px' }}>📄 {d.title}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p style={{ fontSize: '32px', color: '#64748b' }}>Waiting for agenda item…</p>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <ClockPanel elapsed={elapsed} />
          {timer && timer.show_on_dais && timer.remaining_seconds > 0 && (
            <div style={timerBox}>
              <p style={{ margin: 0, fontSize: '16px', color: '#94a3b8' }}>{timer.label}</p>
              <p style={{ margin: '8px 0 0', fontSize: '56px', fontWeight: 700, fontFamily: 'monospace' }}>
                {formatOffsetSeconds(timer.remaining_seconds)}
              </p>
            </div>
          )}
          {state.upcoming_items.length > 0 && (
            <div>
              <p style={{ margin: '0 0 10px', fontSize: '14px', color: '#64748b', textTransform: 'uppercase' }}>Up next</p>
              {state.upcoming_items.slice(0, 2).map(u => (
                <div key={u.id} style={{ marginBottom: '10px', padding: '12px', background: 'rgba(255,255,255,0.06)', borderRadius: '8px' }}>
                  <span style={{ fontSize: '14px', color: '#60a5fa' }}>{u.item_number}</span>
                  <p style={{ margin: '4px 0 0', fontSize: '18px' }}>{u.title}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ClockPanel({ elapsed }: { elapsed: number }) {
  const now = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return (
    <div style={{ padding: '16px', background: 'rgba(255,255,255,0.06)', borderRadius: '12px' }}>
      <p style={{ margin: 0, fontSize: '16px', color: '#94a3b8' }}>Current time</p>
      <p style={{ margin: '4px 0 16px', fontSize: '32px', fontWeight: 600 }}>{now}</p>
      <p style={{ margin: 0, fontSize: '16px', color: '#94a3b8' }}>Meeting elapsed</p>
      <p style={{ margin: '4px 0 0', fontSize: '32px', fontWeight: 600, fontFamily: 'monospace' }}>{formatOffsetSeconds(elapsed)}</p>
    </div>
  )
}

const root: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0a1628',
  color: '#f0f4ff',
  fontFamily: 'system-ui, sans-serif',
  padding: '32px 40px',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
}

const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px', textDecoration: 'underline' }
const pickerOverlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }
const pickerCard: React.CSSProperties = { background: '#1e293b', padding: '24px', borderRadius: '12px', minWidth: '280px', maxHeight: '70vh', overflowY: 'auto' }
const pickerItem: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '12px', marginBottom: '4px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '16px', cursor: 'pointer', fontFamily: 'inherit' }
const timerBox: React.CSSProperties = { padding: '20px', background: 'rgba(30,108,181,0.25)', borderRadius: '12px', border: '1px solid rgba(96,165,250,0.4)' }
