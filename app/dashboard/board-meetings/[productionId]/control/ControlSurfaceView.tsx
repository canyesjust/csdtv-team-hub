'use client'

import Link from 'next/link'
import { useState, type CSSProperties, type ReactNode } from 'react'
import QRPushPanel from './QRPushPanel'
import AttendancePanel from './components/AttendancePanel'
import MotionAndVoteCard from './components/MotionAndVoteCard'
import PlaylistLiveControls from './components/PlaylistLiveControls'
import LowerThirdPanel from './components/LowerThirdPanel'
import type { ControlBundle } from './control-surface-types'

function CollapsiblePanel({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string
  summary?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const headerBg = 'var(--surface-2)'

  return (
    <div style={{ border: `0.5px solid ${border}`, borderRadius: '10px', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '12px 14px',
          minHeight: '48px',
          background: headerBg,
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '15px', fontWeight: 600, color: text }}>{title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {!open && summary ? (
            <span style={{ fontSize: '13px', color: muted, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {summary}
            </span>
          ) : null}
          <span style={{ fontSize: '11px', color: muted, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }} aria-hidden>
            ▼
          </span>
        </span>
      </button>
      {open ? <div style={{ padding: '12px 14px', borderTop: `0.5px solid ${border}` }}>{children}</div> : null}
    </div>
  )
}

export type ControlSurfaceViewProps = {
  productionId: string
  bundle: ControlBundle
  busy: boolean
  canControl: boolean
  currentId: string | null | undefined
  currentItem: ControlBundle['items'][number] | undefined
  status: string
  mode: string
  broadcastable: ControlBundle['items']
  assignedIds: Set<string>
  btn: CSSProperties
  primaryBtn: CSSProperties
  dangerBtn: CSSProperties
  post: (path: string, body?: Record<string, unknown>) => Promise<void>
  toggleChannel: (channelId: string) => Promise<void>
  onUpdated: () => void
}

export default function ControlSurfaceView({
  productionId,
  bundle,
  busy,
  canControl,
  currentId,
  currentItem,
  status,
  mode,
  broadcastable,
  assignedIds,
  btn,
  primaryBtn,
  dangerBtn,
  post,
  toggleChannel,
  onUpdated,
}: ControlSurfaceViewProps) {
  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const productionTitle = bundle.production?.title

  return (
    <div className="control-surface control-shell">
      <header className="control-header">
        <nav className="control-header__nav" aria-label="Breadcrumb">
          <Link href="/dashboard/board-meetings">← Board Meetings</Link>
          {bundle.production?.production_number != null && (
            <Link href={`/dashboard/productions/${bundle.production.production_number}?tab=boardmeeting`}>
              ← Board Meeting tab
            </Link>
          )}
          <Link href={`/dashboard/board-meetings/${productionId}/buttons`}>Companion buttons →</Link>
        </nav>
        <div className="control-header__title-row">
          <div>
            <h1 className="control-header__title">
              Control surface
              {productionTitle ? ` · ${productionTitle}` : ''}
            </h1>
            <p className="control-header__meta">
              Status: <strong style={{ color: text }}>{status}</strong>
              {mode !== 'normal' && ` · ${mode.replace(/_/g, ' ')}`}
            </p>
            <div style={{ marginTop: 8 }}>
              <AttendancePanel productionId={productionId} disabled={!canControl} />
            </div>
          </div>
        </div>
      </header>

      {!canControl && (
        <p className="control-banner" style={{ marginTop: 10 }}>
          Lock the agenda before using broadcast controls.
        </p>
      )}

      <main className="control-main">
        <section className="control-panel control-panel--agenda" aria-label="Agenda">
          <h2 className="control-panel__head">Agenda</h2>
          <div className="control-panel__body">
            <div className="control-scroll">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {broadcastable.map(it => (
                  <button
                    key={it.id}
                    type="button"
                    disabled={!canControl || busy}
                    onClick={() => post('jump-to', { agenda_item_id: it.id })}
                    className={`control-agenda-btn${it.id === currentId ? ' control-agenda-btn--current' : ''}`}
                  >
                    <span className="control-agenda-btn__num">{it.item_number}</span>
                    <span className="control-agenda-btn__title">{it.title}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="control-panel control-panel--center" aria-label="On air controls">
          <h2 className="control-panel__head">On air</h2>
          <div className="control-panel__body">
            <div className="control-on-air-item">
              {currentItem ? (
                <>
                  <p className="control-on-air-item__num">{currentItem.item_number}</p>
                  <p className="control-on-air-item__title">{currentItem.title}</p>
                </>
              ) : (
                <p style={{ margin: 0, color: muted, fontSize: 14 }}>No current item</p>
              )}
            </div>

            <div className="control-subsection">
              <p className="control-subsection__label">Transport</p>
              <div className="control-btn-row">
                <button type="button" style={btn} disabled={!canControl || busy} onClick={() => post('go-back')}>← Back</button>
                <button type="button" style={primaryBtn} disabled={!canControl || busy} onClick={() => post('advance')}>Advance →</button>
                <button type="button" style={btn} disabled={!canControl || busy} onClick={() => post('toggle-overlay')}>
                  Agenda overlay {bundle.broadcast_state?.overlay_visible ? 'on' : 'off'}
                </button>
              </div>
              <div className="control-btn-row">
                {status !== 'live' ? (
                  <button type="button" style={primaryBtn} disabled={!canControl || busy} onClick={() => post('go-live')}>Go live</button>
                ) : (
                  <button type="button" style={dangerBtn} disabled={busy} onClick={() => post('end-meeting')}>End meeting</button>
                )}
              </div>
            </div>

            <div className="control-subsection control-scroll" style={{ flex: 1, minHeight: 120 }}>
              <p className="control-subsection__label">Lower third</p>
              <LowerThirdPanel
                productionId={productionId}
                broadcastState={bundle.broadcast_state}
                disabled={!canControl || busy}
                onUpdated={onUpdated}
              />
            </div>

            <div className="control-subsection">
              <p className="control-subsection__label">QR code</p>
              <QRPushPanel
                productionId={productionId}
                broadcastState={bundle.broadcast_state}
                currentDocuments={bundle.current_documents || []}
                hasYoutube={!!(bundle.production?.livestream_url || '').trim()}
                disabled={!canControl || status !== 'live'}
                onUpdated={onUpdated}
              />
            </div>

            <MotionAndVoteCard
              productionId={productionId}
              broadcastState={bundle.broadcast_state}
              disabled={!canControl || status !== 'live' || busy}
              onUpdated={onUpdated}
            />
          </div>
        </section>

        <section className="control-panel control-panel--utilities" aria-label="Broadcast utilities">
          <h2 className="control-panel__head">Utilities</h2>
          <div className="control-panel__body">
            <div className="cs-utilities-grid">
              <CollapsiblePanel title="Pre-roll playlist" summary="Playlist playback" defaultOpen={status === 'prepared'}>
                <PlaylistLiveControls productionId={productionId} disabled={!canControl} onUpdated={onUpdated} />
              </CollapsiblePanel>

              <CollapsiblePanel
                title="Modes & timers"
                summary={
                  bundle.active_timer
                    ? `Timer: ${bundle.active_timer.label}`
                    : mode !== 'normal'
                      ? mode.replace(/_/g, ' ')
                      : 'Recess, tech diff, timers'
                }
                defaultOpen={mode !== 'normal' || !!bundle.active_timer}
              >
                <div className="control-btn-row" style={{ marginBottom: 12 }}>
                  <button type="button" style={btn} disabled={!canControl || busy} onClick={() => post('recess', { message: 'Recess' })}>Recess</button>
                  <button type="button" style={btn} disabled={!canControl || busy} onClick={() => post('technical-difficulties')}>Tech diff</button>
                  <button type="button" style={btn} disabled={!canControl || busy} onClick={() => post('clear-mode')}>Clear mode</button>
                </div>
                {bundle.timer_templates.length > 0 && (
                  <div className="control-btn-row" style={{ marginBottom: 12 }}>
                    {bundle.timer_templates.map(t => (
                      <button key={t.id} type="button" style={btn} disabled={!canControl || busy} onClick={() => post('start-timer', { template_id: t.id })}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
                {bundle.active_timer && (
                  <p style={{ fontSize: 13, color: muted, margin: '0 0 8px' }}>Timer: {bundle.active_timer.label}</p>
                )}
                <div className="control-btn-row">
                  <button type="button" style={btn} disabled={!canControl || busy || !bundle.active_timer} onClick={() => post('end-timer')}>End timer</button>
                  <button type="button" style={btn} disabled={!canControl || busy || !bundle.active_timer} onClick={() => post('cancel-timer')}>Cancel timer</button>
                </div>
              </CollapsiblePanel>

              <CollapsiblePanel title="Output channels" summary={`${assignedIds.size} of ${bundle.output_channels.length} assigned`}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {bundle.output_channels.map(ch => (
                    <label key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: text, minHeight: 44 }}>
                      <input type="checkbox" checked={assignedIds.has(ch.id)} disabled={!canControl || busy} onChange={() => toggleChannel(ch.id)} />
                      Ch {ch.channel_number} — {ch.channel_name}
                    </label>
                  ))}
                </div>
              </CollapsiblePanel>

              <CollapsiblePanel
                title="Recent events"
                summary={
                  bundle.recent_events[0]
                    ? `${new Date(bundle.recent_events[0].occurred_at).toLocaleTimeString()} — ${bundle.recent_events[0].event_type}`
                    : 'No events yet'
                }
              >
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {bundle.recent_events.length === 0 ? (
                    <li style={{ fontSize: 13, color: muted }}>No events logged yet.</li>
                  ) : (
                    bundle.recent_events.slice(0, 20).map((ev, i) => (
                      <li key={i} style={{ fontSize: 12, color: muted, padding: '6px 0', borderBottom: `0.5px solid ${border}` }}>
                        {new Date(ev.occurred_at).toLocaleTimeString()} — {ev.event_type}
                      </li>
                    ))
                  )}
                </ul>
              </CollapsiblePanel>
            </div>
          </div>
        </section>

      </main>
    </div>
  )
}
