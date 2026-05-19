'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import MotionAndVoteCard from './components/MotionAndVoteCard'

type AgendaItem = {
  id: string
  item_number: string
  title: string
  type?: string
  is_broadcastable?: boolean
}

type Person = {
  id: string
  display_name: string
  title?: string | null
  affiliation?: string | null
  category: 'board_member' | 'staff' | 'presenter' | 'other'
  officer_position?: string | null
  district?: string | null
}

type BroadcastState = {
  status: 'draft' | 'prepared' | 'live' | 'archived'
  mode: 'normal' | 'recess' | 'technical_difficulties'
  current_agenda_item_id: string | null
  agenda_overlay_visible: boolean
  live_started_at: string | null
  active_lower_third_person_id: string | null
  active_qr_url: string | null
}

type MotionLifecycleState = {
  state: 'no_motion' | 'drafting' | 'open_for_discussion' | 'voting' | 'voted' | 'closed'
  active_motion: {
    id: string
    motion_type: 'main' | 'substitute' | 'amendment'
    text: string | null
    mover_name: string | null
    seconder_name: string | null
  } | null
  recorded_votes_count: number
}

type ResultOverlayState = {
  active: boolean
  motion_id: string
  passed: boolean
  yea_count: number
  nay_count: number
  abstain_count: number
  started_at: string
  total_duration: number
  seconds_remaining: number
  held: boolean
}

type Attendance = {
  present_count: number
  quorum_size: number
  quorum_met: boolean
}

export type ControlBundle = {
  meeting: { id: string; title: string; quorum_size?: number } | null
  broadcast_state: BroadcastState | null
  agenda_items: AgendaItem[]
  lower_third_people: Person[]
  motion_lifecycle: MotionLifecycleState | null
  result_overlay: ResultOverlayState | null
  attendance: Attendance
  channels?: Array<{ id: string; channel_number: number; view_type: string }>
  channel_assignments?: Array<{ channel_id: string }>
  recent_events?: Array<{ created_at: string; event_type: string }>
  playlist_state?: { playback_state: string } | null
  active_timer?: { id: string } | null
}

type Props = {
  productionId: string
  bundle: ControlBundle
  canControl: boolean
  onAction: (action: string, body?: unknown) => Promise<void>
  busy: boolean
}

export default function ControlSurfaceView({ productionId, bundle, canControl, onAction, busy }: Props) {
  const router = useRouter()
  const { meeting, broadcast_state, agenda_items, motion_lifecycle, attendance, result_overlay } = bundle
  const meetingTitle = meeting?.title || 'Board Meeting'
  const status = broadcast_state?.status || 'draft'
  const mode = broadcast_state?.mode || 'normal'
  const isLive = status === 'live'
  const currentItemId = broadcast_state?.current_agenda_item_id || null

  const broadcastableItems = (agenda_items || []).filter(i => i.is_broadcastable !== false)
  const currentItem = broadcastableItems.find(i => i.id === currentItemId) || null
  const currentIndex = currentItem ? broadcastableItems.findIndex(i => i.id === currentItem.id) : -1

  const liveElapsed = isLive && broadcast_state?.live_started_at
    ? formatElapsed(Date.now() - new Date(broadcast_state.live_started_at).getTime())
    : null

  const boardMembers = (bundle.lower_third_people || []).filter(p => p.category === 'board_member')
  const staffAndOther = (bundle.lower_third_people || []).filter(p => p.category !== 'board_member')
  const activeLowerThirdId = broadcast_state?.active_lower_third_person_id || null
  const activeLowerThirdPerson = (bundle.lower_third_people || []).find(p => p.id === activeLowerThirdId) || null

  const goToMotion = () => router.push(`/control/${productionId}/motion`)

  return (
    <div className="control-surface">

      <div className="cs-header">
        <div className="cs-header-breadcrumbs">
          <Link href="/dashboard/board-meetings">← Board Meetings</Link>
          <Link href={`/dashboard/productions/${productionId}?tab=boardmeeting`}>← Board Meeting tab</Link>
          <Link href={`/dashboard/board-meetings/${productionId}/buttons`}>Companion buttons →</Link>
        </div>
        <div className="cs-header-row">
          <div className="cs-header-title">Control surface · {meetingTitle}</div>
          <div className="cs-header-right">
            {isLive && (
              <span className="cs-live-pill">
                <span className="cs-pulse-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor' }} />
                LIVE{liveElapsed ? ` · ${liveElapsed}` : ''}
              </span>
            )}
            <span className={'cs-quorum-pill' + (attendance.quorum_met ? ' cs-quorum-met' : '')}>
              {attendance.present_count}/{attendance.quorum_size} quorum {attendance.quorum_met ? '✓' : ''}
            </span>
            <button
              type="button"
              className="cs-touchbtn cs-touchbtn-small"
              onClick={() => onAction('open-attendance')}
              disabled={!canControl}
            >
              Mark attendance
            </button>
          </div>
        </div>
      </div>

      {mode !== 'normal' && (
        <ModeBanner mode={mode} />
      )}

      <div className="cs-main">

        <div className="cs-agenda">
          <div className="cs-eyebrow" style={{ paddingLeft: 4 }}>AGENDA</div>
          {broadcastableItems.map((item, idx) => {
            const isOnAir = item.id === currentItemId
            const isDone = currentIndex !== -1 && idx < currentIndex
            const cls = 'cs-agenda-item'
              + (isOnAir ? ' cs-agenda-item-onair' : '')
              + (isDone ? ' cs-agenda-item-done' : '')
            return (
              <button
                key={item.id}
                type="button"
                className={cls}
                onClick={() => onAction('jump-to', { agenda_item_id: item.id })}
                disabled={!canControl || busy}
              >
                <span className="cs-agenda-num">{isOnAir ? '● ' : isDone ? '✓ ' : ''}{item.item_number}</span>
                <span className="cs-agenda-title">{item.title}</span>
              </button>
            )
          })}
        </div>

        <div className="cs-onair">

          <div className="cs-card">
            <div className="cs-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isLive && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--semantic-danger-text)' }} />}
              ON AIR{currentItem ? ` · ITEM ${currentItem.item_number}` : ''}
              {currentItem?.type && (
                <span style={{
                  marginLeft: 6,
                  padding: '2px 8px',
                  borderRadius: 8,
                  background: 'var(--semantic-info-bg)',
                  color: 'var(--semantic-info-text)',
                  fontSize: 10,
                  letterSpacing: '0.04em',
                }}>
                  {String(currentItem.type).toUpperCase()}
                </span>
              )}
            </div>
            <div className="cs-onair-title">
              {currentItem ? currentItem.title : 'No item on air'}
            </div>
          </div>

          <div className="cs-card">
            <div className="cs-eyebrow">Transport</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr 1.4fr', gap: 8 }}>
              <button
                type="button"
                className="cs-touchbtn"
                onClick={() => onAction('go-back')}
                disabled={!canControl || busy || currentIndex <= 0}
              >
                ← Back
              </button>
              <button
                type="button"
                className="cs-touchbtn cs-touchbtn-primary"
                onClick={() => onAction('advance')}
                disabled={!canControl || busy}
              >
                Advance →
              </button>
              <button
                type="button"
                className="cs-touchbtn"
                onClick={() => onAction('toggle-overlay')}
                disabled={!canControl || busy}
              >
                Agenda overlay {broadcast_state?.agenda_overlay_visible !== false
                  ? <span style={{ color: 'var(--semantic-success-text)', fontWeight: 500 }}>on</span>
                  : <span style={{ color: 'var(--text-muted, #6b7385)' }}>off</span>}
              </button>
            </div>
          </div>

          <div className="cs-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <div className="cs-eyebrow" style={{ marginBottom: 0 }}>Lower third</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted, #6b7385)' }}>On air:</span>
                {activeLowerThirdPerson ? (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px', borderRadius: 999,
                    background: 'var(--semantic-info-bg)',
                    color: 'var(--semantic-info-text)',
                    fontSize: 11, fontWeight: 500,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                    {activeLowerThirdPerson.display_name}
                    {activeLowerThirdPerson.district ? ` · ${activeLowerThirdPerson.district}` : ''}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--text-muted, #6b7385)', fontStyle: 'italic' }}>None</span>
                )}
                {activeLowerThirdPerson && (
                  <button
                    type="button"
                    className="cs-touchbtn cs-touchbtn-small"
                    onClick={() => onAction('clear-lower-third')}
                    disabled={!canControl || busy}
                    style={{ minHeight: 30, padding: '4px 10px', fontSize: 11 }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div className="cs-lower-third-grid">
              {boardMembers.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className={'cs-lower-third-btn' + (p.id === activeLowerThirdId ? ' cs-lower-third-active' : '')}
                  onClick={() => onAction('set-lower-third', { person_id: p.id })}
                  disabled={!canControl || busy}
                >
                  <div className="cs-lower-third-btn-title">{p.display_name}</div>
                  <div className="cs-lower-third-btn-sub">
                    {p.officer_position ? p.officer_position : (p.district || p.title || '')}
                  </div>
                </button>
              ))}
            </div>
            {staffAndOther.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary style={{
                  fontSize: 11,
                  color: 'var(--text-muted, #6b7385)',
                  cursor: 'pointer',
                  padding: '4px 0',
                }}>
                  Staff & other ({staffAndOther.length})
                </summary>
                <div className="cs-lower-third-grid" style={{ marginTop: 8 }}>
                  {staffAndOther.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className={'cs-lower-third-btn' + (p.id === activeLowerThirdId ? ' cs-lower-third-active' : '')}
                      onClick={() => onAction('set-lower-third', { person_id: p.id })}
                      disabled={!canControl || busy}
                    >
                      <div className="cs-lower-third-btn-title">{p.display_name}</div>
                      <div className="cs-lower-third-btn-sub">{p.title || p.affiliation || ''}</div>
                    </button>
                  ))}
                </div>
              </details>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <QRPushPanel
              canControl={canControl && isLive}
              busy={busy}
              activeQR={broadcast_state?.active_qr_url || null}
              onPush={(url, label) => onAction('push-qr', { url, label })}
              onClear={() => onAction('clear-qr')}
            />
            <MotionAndVoteCard
              lifecycle={motion_lifecycle}
              resultOverlay={result_overlay}
              isLive={isLive}
              onOpenMotion={goToMotion}
              onContinueMotion={goToMotion}
              onHoldResult={() => onAction('hold-result')}
              onDismissResult={() => onAction('dismiss-result')}
            />
          </div>

          {isLive && (
            <div className="cs-end-meeting-row">
              <button
                type="button"
                className="cs-touchbtn cs-touchbtn-danger"
                onClick={() => {
                  if (confirm('End the meeting? This cannot be undone.')) {
                    onAction('end-meeting')
                  }
                }}
                disabled={!canControl || busy}
              >
                End meeting
              </button>
            </div>
          )}

        </div>
      </div>

      <div className="cs-utilities">
        <div className="cs-eyebrow" style={{ marginBottom: 8 }}>UTILITIES</div>
        <div className="cs-utilities-grid">
          <UtilityPanel
            title="Pre-roll"
            summary={bundle.playlist_state?.playback_state || 'Idle'}
          />
          <UtilityPanel
            title="Modes & timers"
            summary={mode !== 'normal' ? mode.replace('_', ' ') : (bundle.active_timer ? 'Timer running' : 'Idle')}
            highlight={mode !== 'normal'}
          />
          <UtilityPanel
            title="Output channels"
            summary={`${(bundle.channel_assignments || []).length} of ${(bundle.channels || []).length || 8} assigned`}
          />
          <UtilityPanel
            title="Recent events"
            summary={summarizeEvents(bundle.recent_events)}
          />
        </div>
      </div>

    </div>
  )
}

function ModeBanner({ mode }: { mode: string }) {
  const isRecess = mode === 'recess'
  const bg = isRecess ? 'var(--semantic-warning-bg)' : 'var(--semantic-danger-bg)'
  const fg = isRecess ? 'var(--semantic-warning-text)' : 'var(--semantic-danger-text)'
  const label = mode.replace('_', ' ').toUpperCase()
  return (
    <div style={{
      padding: '10px 20px',
      background: bg,
      color: fg,
      fontSize: 13,
      fontWeight: 500,
      letterSpacing: '0.05em',
      textAlign: 'center',
    }}>
      ⚠ {label}
    </div>
  )
}

function UtilityPanel({ title, summary, highlight }: { title: string; summary: string; highlight?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <button type="button" className="cs-utility-panel" onClick={() => setOpen(o => !o)} style={highlight ? { borderColor: 'var(--semantic-warning-border)' } : undefined}>
      <div className="cs-utility-panel-header">
        <div>
          <div className="cs-utility-panel-title">{title}</div>
          <div className="cs-utility-panel-summary">{summary}</div>
        </div>
        <span style={{ fontSize: 14, color: 'var(--text-muted, #6b7385)' }}>{open ? '▴' : '▾'}</span>
      </div>
      {open && (
        <div className="cs-utility-panel-body">
          <div style={{ fontSize: 11, color: 'var(--text-muted, #6b7385)' }}>
            Panel content goes here. Wire up the existing panel components or build inline.
          </div>
        </div>
      )}
    </button>
  )
}

function QRPushPanel({ canControl, busy, activeQR, onPush, onClear }: {
  canControl: boolean
  busy: boolean
  activeQR: string | null
  onPush: (url: string, label: string) => void
  onClear: () => void
}) {
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')

  return (
    <div className="cs-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="cs-eyebrow" style={{ marginBottom: 0 }}>QR code</div>
        {activeQR && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 8px', borderRadius: 999,
            background: 'var(--semantic-info-bg)',
            color: 'var(--semantic-info-text)',
            fontSize: 10, fontWeight: 500,
          }}>
            on air
          </span>
        )}
      </div>
      <input
        type="text"
        placeholder="https://..."
        value={url}
        onChange={e => setUrl(e.target.value)}
        style={{
          width: '100%',
          background: 'var(--surface-2, #1a2236)',
          border: '0.5px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
          borderRadius: 8,
          padding: '8px 10px',
          color: 'var(--text-primary, #f8fafc)',
          fontSize: 12,
          marginBottom: 6,
          fontFamily: 'inherit',
        }}
      />
      <input
        type="text"
        placeholder="Label"
        value={label}
        onChange={e => setLabel(e.target.value)}
        style={{
          width: '100%',
          background: 'var(--surface-2, #1a2236)',
          border: '0.5px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
          borderRadius: 8,
          padding: '8px 10px',
          color: 'var(--text-primary, #f8fafc)',
          fontSize: 12,
          marginBottom: 8,
          fontFamily: 'inherit',
        }}
      />
      <button
        type="button"
        className="cs-touchbtn"
        onClick={() => onPush(url, label)}
        disabled={!canControl || busy || !url}
        style={{ width: '100%', minHeight: 40 }}
      >
        Push QR
      </button>
      {activeQR && (
        <button
          type="button"
          onClick={onClear}
          className="cs-touchbtn cs-touchbtn-small"
          disabled={!canControl || busy}
          style={{ width: '100%', marginTop: 6 }}
        >
          Clear QR
        </button>
      )}
    </div>
  )
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function summarizeEvents(events: ControlBundle['recent_events']): string {
  if (!events || events.length === 0) return 'No events yet'
  const last = events[0]
  const time = last?.created_at ? new Date(last.created_at).toLocaleTimeString() : ''
  const label = last?.event_type || ''
  return `${time} · ${label}`
}
