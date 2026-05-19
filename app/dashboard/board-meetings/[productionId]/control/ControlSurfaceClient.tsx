'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Loader from '../../../components/Loader'
import { toast } from '@/lib/toast'
import QRPushPanel from './QRPushPanel'
import AttendancePanel from './components/AttendancePanel'
import MotionVotePanel from './components/MotionVotePanel'
import PlaylistLiveControls from './components/PlaylistLiveControls'
import LowerThirdPanel from './components/LowerThirdPanel'

type ControlBundle = {
  board_meeting: { id: string; broadcast_status: string; agenda_locked: boolean }
  items: {
    id: string
    section_number: number
    section_title: string
    item_number: string
    title: string
    is_broadcastable: boolean
    type: string
    consent_block?: string | null
  }[]
  production?: { production_number: number; livestream_url: string | null; title: string } | null
  current_documents?: { source_url: string | null; title: string }[]
  broadcast_state: {
    current_agenda_item_id: string | null
    overlay_visible: boolean
    mode: string
    mode_message: string | null
    active_qr_url?: string | null
    active_qr_label?: string | null
    active_qr_started_at?: string | null
    active_qr_duration_seconds?: number | null
    active_motion_id?: string | null
    active_vote_result_motion_id?: string | null
    vote_result_started_at?: string | null
    vote_result_duration_seconds?: number | null
  } | null
  channel_assignments: { output_channel_id: string }[]
  active_timer: { id: string; label: string; duration_seconds: number; started_at: string } | null
  recent_events: { event_type: string; occurred_at: string }[]
  output_channels: { id: string; channel_number: number; channel_name: string }[]
  timer_templates: { id: string; name: string; duration_seconds: number }[]
}

export default function ControlSurfaceClient({ productionId }: { productionId: string }) {
  const supabase = createClient()
  const [bundle, setBundle] = useState<ControlBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'

  const load = useCallback(async () => {
    const res = await fetch(`/api/board-meetings/${productionId}/control`)
    const body = await res.json()
    if (!res.ok) {
      toast(body.error || 'Failed to load control data', 'error')
      setLoading(false)
      return
    }
    setBundle(body)
    setLoading(false)
  }, [productionId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!bundle?.board_meeting?.id) return
    const channel = supabase
      .channel(`broadcast-${bundle.board_meeting.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_broadcast_state', filter: `board_meeting_id=eq.${bundle.board_meeting.id}` },
        () => { load() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_timers', filter: `board_meeting_id=eq.${bundle.board_meeting.id}` },
        () => { load() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_motions', filter: `board_meeting_id=eq.${bundle.board_meeting.id}` },
        () => { load() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_attendance', filter: `board_meeting_id=eq.${bundle.board_meeting.id}` },
        () => { load() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_playlists', filter: `board_meeting_id=eq.${bundle.board_meeting.id}` },
        () => { load() },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [bundle?.board_meeting?.id, supabase, load])

  const post = async (path: string, body?: Record<string, unknown>) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/board-meetings/${productionId}/control/${path}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json()
      if (!res.ok) toast(data.error || 'Action failed', 'error')
      else await load()
    } finally {
      setBusy(false)
    }
  }

  const assignedIds = useMemo(
    () => new Set((bundle?.channel_assignments || []).map(a => a.output_channel_id)),
    [bundle?.channel_assignments],
  )

  const toggleChannel = async (channelId: string) => {
    setBusy(true)
    try {
      const method = assignedIds.has(channelId) ? 'DELETE' : 'POST'
      const res = await fetch(`/api/board-meetings/${productionId}/channels`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output_channel_id: channelId }),
      })
      if (!res.ok) {
        const d = await res.json()
        toast(d.error || 'Channel update failed', 'error')
        return
      }
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loader />
  if (!bundle) return <p style={{ color: muted }}>Board meeting not found.</p>

  const currentId = bundle.broadcast_state?.current_agenda_item_id
  const currentItem = bundle.items.find(i => i.id === currentId)
  const status = bundle.board_meeting.broadcast_status
  const mode = bundle.broadcast_state?.mode || 'normal'
  const canControl = bundle.board_meeting.agenda_locked && status !== 'archived' && status !== 'cancelled'
  const broadcastable = bundle.items.filter(i => i.is_broadcastable)

  const btn: React.CSSProperties = {
    fontSize: '14px',
    padding: '12px 16px',
    minHeight: '48px',
    borderRadius: '10px',
    border: `0.5px solid ${border}`,
    background: cardBg,
    color: text,
    cursor: busy ? 'wait' : 'pointer',
    fontFamily: 'inherit',
    fontWeight: 600,
    opacity: busy ? 0.6 : 1,
  }
  const primaryBtn: React.CSSProperties = { ...btn, background: '#1e6cb5', color: '#fff', border: 'none' }
  const dangerBtn: React.CSSProperties = { ...btn, background: '#8b1a1a', color: '#fff', border: 'none' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', color: text }}>Control surface</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: muted }}>
            Status: <strong>{status}</strong>
            {mode !== 'normal' && ` · ${mode.replace('_', ' ')}`}
          </p>
          <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px' }}>
            <AttendancePanel productionId={productionId} disabled={!canControl} />
          </div>
        </div>
        <Link href={`/dashboard/board-meetings/${productionId}/buttons`} style={{ color: 'var(--brand-primary)', fontSize: '14px' }}>
          Companion buttons →
        </Link>
      </div>

      {!canControl && (
        <p style={{ padding: '12px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '8px', color: muted, margin: 0 }}>
          Lock the agenda before using broadcast controls.
        </p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
          alignItems: 'start',
        }}
      >
        <section style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '14px' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: '15px', color: text }}>Agenda</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '420px', overflowY: 'auto' }}>
            {broadcastable.map(it => (
              <button
                key={it.id}
                type="button"
                disabled={!canControl || busy}
                onClick={() => post('jump-to', { agenda_item_id: it.id })}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: `0.5px solid ${it.id === currentId ? 'var(--brand-primary)' : border}`,
                  background: it.id === currentId ? 'rgba(30,108,181,0.12)' : 'transparent',
                  cursor: busy ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                  color: text,
                }}
              >
                <span style={{ fontSize: '12px', color: muted }}>{it.item_number}</span>
                <span style={{ display: 'block', fontSize: '14px', marginTop: '2px' }}>{it.title}</span>
              </button>
            ))}
          </div>
        </section>

        <section style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '14px' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: '15px', color: text }}>On air</h2>
          {currentItem ? (
            <div style={{ marginBottom: '16px' }}>
              <p style={{ margin: '0 0 4px', fontSize: '12px', color: muted }}>{currentItem.item_number}</p>
              <p style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: text, lineHeight: 1.35 }}>{currentItem.title}</p>
            </div>
          ) : (
            <p style={{ color: muted, fontSize: '14px' }}>No current item</p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button type="button" style={btn} disabled={!canControl || busy} onClick={() => post('go-back')}>← Back</button>
            <button type="button" style={primaryBtn} disabled={!canControl || busy} onClick={() => post('advance')}>Advance →</button>
            <button type="button" style={btn} disabled={!canControl || busy} onClick={() => post('toggle-overlay')}>
              Overlay {bundle.broadcast_state?.overlay_visible ? 'on' : 'off'}
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
            {status !== 'live' ? (
              <button type="button" style={primaryBtn} disabled={!canControl || busy} onClick={() => post('go-live')}>Go live</button>
            ) : (
              <button type="button" style={dangerBtn} disabled={busy} onClick={() => post('end-meeting')}>End meeting</button>
            )}
          </div>
          <div>
            <h3 style={{ margin: '0 0 10px', fontSize: '13px', color: muted }}>Lower third</h3>
            <LowerThirdPanel
              productionId={productionId}
              broadcastState={bundle.broadcast_state}
              disabled={!canControl || busy}
              onUpdated={load}
            />
          </div>
          <div style={{ marginTop: '16px' }}>
            <QRPushPanel
              productionId={productionId}
              broadcastState={bundle.broadcast_state}
              currentDocuments={bundle.current_documents || []}
              hasYoutube={!!(bundle.production?.livestream_url || '').trim()}
              disabled={!canControl || status !== 'live'}
              onUpdated={load}
            />
          </div>
        </section>

        <section style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '14px' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: '15px', color: text }}>Pre-roll playlist</h2>
          <PlaylistLiveControls productionId={productionId} disabled={!canControl} onUpdated={load} />
        </section>

        <section style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '14px' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: '15px', color: text }}>Modes & timers</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
            <button type="button" style={btn} disabled={!canControl || busy} onClick={() => post('recess', { message: 'Recess' })}>Recess</button>
            <button type="button" style={btn} disabled={!canControl || busy} onClick={() => post('technical-difficulties')}>Tech diff</button>
            <button type="button" style={btn} disabled={!canControl || busy} onClick={() => post('clear-mode')}>Clear mode</button>
          </div>
          {bundle.timer_templates.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
              {bundle.timer_templates.map(t => (
                <button key={t.id} type="button" style={btn} disabled={!canControl || busy} onClick={() => post('start-timer', { template_id: t.id })}>
                  {t.name}
                </button>
              ))}
            </div>
          )}
          {bundle.active_timer && (
            <p style={{ fontSize: '13px', color: muted, margin: '0 0 8px' }}>Timer: {bundle.active_timer.label}</p>
          )}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button type="button" style={btn} disabled={!canControl || busy || !bundle.active_timer} onClick={() => post('end-timer')}>End timer</button>
            <button type="button" style={btn} disabled={!canControl || busy || !bundle.active_timer} onClick={() => post('cancel-timer')}>Cancel timer</button>
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: '13px', color: muted }}>Output channels</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            {bundle.output_channels.map(ch => (
              <label key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: text, minHeight: '44px' }}>
                <input
                  type="checkbox"
                  checked={assignedIds.has(ch.id)}
                  disabled={!canControl || busy}
                  onChange={() => toggleChannel(ch.id)}
                />
                Ch {ch.channel_number} — {ch.channel_name}
              </label>
            ))}
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: '13px', color: muted }}>Recent events</h3>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', maxHeight: '160px', overflowY: 'auto' }}>
            {bundle.recent_events.slice(0, 12).map((ev, i) => (
              <li key={i} style={{ fontSize: '12px', color: muted, padding: '4px 0', borderBottom: `0.5px solid ${border}` }}>
                {new Date(ev.occurred_at).toLocaleTimeString()} — {ev.event_type}
              </li>
            ))}
          </ul>
        </section>

        <div style={{ gridColumn: '1 / -1' }}>
          <MotionVotePanel
            productionId={productionId}
            currentItem={currentItem}
            allItems={bundle.items}
            broadcastState={bundle.broadcast_state}
            disabled={!canControl || status !== 'live'}
            onUpdated={load}
          />
        </div>
      </div>
    </div>
  )
}
