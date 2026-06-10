'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { confirmDialog } from '@/lib/confirm'
import { sortByBoardSeatOrder } from '@/lib/board-meetings/lower-third-board-order'
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

const COLOR = {
  bg: 'var(--bg-main, #0a0f1e)',
  bgTopbar: 'var(--bg-topbar, #0f1729)',
  surface1: 'var(--surface-1, #131b2e)',
  surface2: 'var(--surface-2, #1a2236)',
  textPrimary: 'var(--text-primary, #f8fafc)',
  textMuted: 'var(--text-muted, #6b7385)',
  borderSubtle: 'var(--border-subtle, rgba(255, 255, 255, 0.08))',
  brandPrimary: 'var(--brand-primary, #1e6cb5)',
  dangerBg: 'rgba(239, 68, 68, 0.12)',
  dangerBorder: 'rgba(239, 68, 68, 0.35)',
  dangerText: '#ef4444',
  successBg: 'rgba(34, 197, 94, 0.12)',
  successBorder: 'rgba(34, 197, 94, 0.35)',
  successText: '#22c55e',
  warningBg: 'rgba(245, 158, 11, 0.12)',
  warningBorder: 'rgba(245, 158, 11, 0.35)',
  warningText: '#f59e0b',
  infoBg: 'rgba(30, 108, 181, 0.18)',
  infoBorder: 'rgba(30, 108, 181, 0.45)',
  infoText: '#5fa6ed',
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

  const boardMembers = sortByBoardSeatOrder(
    (bundle.lower_third_people || []).filter(p => p.category === 'board_member'),
  )
  const staffAndOther = (bundle.lower_third_people || []).filter(p => p.category !== 'board_member')
  const activeLowerThirdId = broadcast_state?.active_lower_third_person_id || null
  const activeLowerThirdPerson = (bundle.lower_third_people || []).find(p => p.id === activeLowerThirdId) || null

  const goToMotion = () => router.push(`/control/${productionId}/motion`)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100dvh',
      background: COLOR.bg,
      color: COLOR.textPrimary,
    }}>

      <div style={{
        flex: '0 0 auto',
        padding: '14px 20px',
        borderBottom: `0.5px solid ${COLOR.borderSubtle}`,
        background: COLOR.bgTopbar,
      }}>
        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: COLOR.brandPrimary, marginBottom: 8 }}>
          <Link href="/dashboard/board-meetings" style={{ color: 'inherit', textDecoration: 'none' }}>← Board Meetings</Link>
          <Link href={`/dashboard/productions/${productionId}?tab=boardmeeting`} style={{ color: 'inherit', textDecoration: 'none' }}>← Board Meeting tab</Link>
          <Link href={`/dashboard/board-meetings/${productionId}/buttons`} style={{ color: 'inherit', textDecoration: 'none' }}>Companion buttons →</Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>Control surface · {meetingTitle}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {isLive && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 999,
                background: COLOR.dangerBg, color: COLOR.dangerText,
                fontSize: 11, fontWeight: 500,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', background: 'currentColor',
                  animation: 'cs-pulse-fade 1.6s ease-in-out infinite',
                }} />
                LIVE{liveElapsed ? ` · ${liveElapsed}` : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {mode !== 'normal' && <ModeBanner mode={mode} />}

      <div style={{
        flex: '1 1 auto',
        display: 'grid',
        gridTemplateColumns: '260px 1fr',
        gap: 12,
        padding: '14px 16px',
        minHeight: 0,
        overflow: 'hidden',
      }}>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          overflowY: 'auto',
          minHeight: 0,
          paddingRight: 4,
        }}>
          <div style={eyebrow({ paddingLeft: 4 })}>AGENDA</div>
          {broadcastableItems.map((item, idx) => {
            const isOnAir = item.id === currentItemId
            const isDone = currentIndex !== -1 && idx < currentIndex
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onAction('jump-to', { agenda_item_id: item.id })}
                disabled={!canControl || busy}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: `0.5px solid ${isOnAir ? COLOR.dangerBorder : COLOR.borderSubtle}`,
                  background: isOnAir ? COLOR.dangerBg : 'transparent',
                  cursor: canControl && !busy ? 'pointer' : 'default',
                  textAlign: 'left',
                  color: 'inherit',
                  fontFamily: 'inherit',
                  lineHeight: 1.35,
                  opacity: isDone ? 0.5 : 1,
                  width: '100%',
                }}
              >
                <span style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: isOnAir ? COLOR.dangerText : COLOR.textMuted,
                  whiteSpace: 'nowrap',
                  minWidth: 36,
                  paddingTop: 1,
                  flexShrink: 0,
                }}>
                  {isOnAir ? '● ' : isDone ? '✓ ' : ''}{item.item_number}
                </span>
                <span style={{
                  fontSize: 12,
                  color: isOnAir ? COLOR.dangerText : COLOR.textPrimary,
                  flex: 1,
                  fontWeight: isOnAir ? 500 : 400,
                }}>
                  {item.title}
                </span>
              </button>
            )
          })}
        </div>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          overflowY: 'auto',
          minHeight: 0,
        }}>

          <div style={card()}>
            <div style={{
              ...eyebrow(),
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              {isLive && <span style={{ width: 7, height: 7, borderRadius: '50%', background: COLOR.dangerText }} />}
              ON AIR{currentItem ? ` · ITEM ${currentItem.item_number}` : ''}
              {currentItem?.type && (
                <span style={{
                  marginLeft: 6,
                  padding: '2px 8px',
                  borderRadius: 8,
                  background: COLOR.infoBg,
                  color: COLOR.infoText,
                  fontSize: 10,
                  letterSpacing: '0.04em',
                }}>
                  {String(currentItem.type).toUpperCase()}
                </span>
              )}
            </div>
            <div style={{ fontSize: 24, lineHeight: 1.2, fontWeight: 500 }}>
              {currentItem ? currentItem.title : 'No item on air'}
            </div>
          </div>

          <div style={card()}>
            <div style={eyebrow()}>Transport</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr 1.4fr', gap: 8 }}>
              <button
                type="button"
                onClick={() => onAction('go-back')}
                disabled={!canControl || busy || currentIndex <= 0}
                style={touchBtn()}
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => onAction('advance')}
                disabled={!canControl || busy}
                style={touchBtnPrimary()}
              >
                Advance →
              </button>
              <button
                type="button"
                onClick={() => onAction('toggle-overlay')}
                disabled={!canControl || busy}
                style={touchBtn()}
              >
                Agenda overlay {broadcast_state?.agenda_overlay_visible !== false
                  ? <span style={{ color: COLOR.successText, fontWeight: 500, marginLeft: 4 }}>on</span>
                  : <span style={{ color: COLOR.textMuted, marginLeft: 4 }}>off</span>}
              </button>
            </div>
          </div>

          <div style={card()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <div style={eyebrow({ marginBottom: 0 })}>Lower third</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: COLOR.textMuted }}>On air:</span>
                {activeLowerThirdPerson ? (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px', borderRadius: 999,
                    background: COLOR.infoBg,
                    color: COLOR.infoText,
                    fontSize: 11, fontWeight: 500,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                    {activeLowerThirdPerson.display_name}
                    {activeLowerThirdPerson.district ? ` · ${activeLowerThirdPerson.district}` : ''}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: COLOR.textMuted, fontStyle: 'italic' }}>None</span>
                )}
                {activeLowerThirdPerson && (
                  <button
                    type="button"
                    onClick={() => onAction('clear-lower-third')}
                    disabled={!canControl || busy}
                    style={{
                      ...smallBtn(canControl),
                      minHeight: 28,
                      padding: '4px 10px',
                      fontSize: 11,
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 6,
            }}>
              {boardMembers.map(p => {
                const isActive = p.id === activeLowerThirdId
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onAction('set-lower-third', { person_id: p.id })}
                    disabled={!canControl || busy}
                    style={{
                      padding: '10px 8px',
                      borderRadius: 8,
                      border: `0.5px solid ${isActive ? COLOR.infoBorder : COLOR.borderSubtle}`,
                      background: isActive ? COLOR.infoBg : COLOR.surface2,
                      color: isActive ? COLOR.infoText : COLOR.textPrimary,
                      fontFamily: 'inherit',
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: canControl && !busy ? 'pointer' : 'default',
                      minHeight: 56,
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{p.display_name}</div>
                    <div style={{
                      fontSize: 10,
                      color: isActive ? COLOR.infoText : COLOR.textMuted,
                      opacity: isActive ? 0.85 : 1,
                      marginTop: 2,
                    }}>
                      {p.officer_position ? p.officer_position : (p.district || p.title || '')}
                    </div>
                  </button>
                )
              })}
            </div>
            {staffAndOther.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary style={{
                  fontSize: 11,
                  color: COLOR.textMuted,
                  cursor: 'pointer',
                  padding: '4px 0',
                }}>
                  Staff & other ({staffAndOther.length})
                </summary>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 6,
                  marginTop: 8,
                }}>
                  {staffAndOther.map(p => {
                    const isActive = p.id === activeLowerThirdId
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onAction('set-lower-third', { person_id: p.id })}
                        disabled={!canControl || busy}
                        style={{
                          padding: '10px 8px',
                          borderRadius: 8,
                          border: `0.5px solid ${isActive ? COLOR.infoBorder : COLOR.borderSubtle}`,
                          background: isActive ? COLOR.infoBg : COLOR.surface2,
                          color: isActive ? COLOR.infoText : COLOR.textPrimary,
                          fontFamily: 'inherit',
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: canControl && !busy ? 'pointer' : 'default',
                          minHeight: 56,
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{p.display_name}</div>
                        <div style={{
                          fontSize: 10,
                          color: isActive ? COLOR.infoText : COLOR.textMuted,
                          opacity: isActive ? 0.85 : 1,
                          marginTop: 2,
                        }}>
                          {p.title || p.affiliation || ''}
                        </div>
                      </button>
                    )
                  })}
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
            <div style={{
              marginTop: 6,
              paddingTop: 10,
              borderTop: `0.5px solid ${COLOR.borderSubtle}`,
              display: 'flex',
              justifyContent: 'flex-end',
            }}>
              <button
                type="button"
                onClick={async () => {
                  if (await confirmDialog({ message: 'End the meeting? This cannot be undone.', tone: 'danger', confirmLabel: 'End meeting' })) {
                    onAction('end-meeting')
                  }
                }}
                disabled={!canControl || busy}
                style={{
                  ...touchBtn(),
                  background: COLOR.dangerBg,
                  borderColor: COLOR.dangerBorder,
                  color: COLOR.dangerText,
                }}
              >
                End meeting
              </button>
            </div>
          )}

        </div>
      </div>

      <div style={{
        flex: '0 0 auto',
        padding: '14px 16px',
        borderTop: `0.5px solid ${COLOR.borderSubtle}`,
        background: COLOR.bgTopbar,
      }}>
        <div style={eyebrow({ marginBottom: 8 })}>UTILITIES</div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
        }}>
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

      <style jsx global>{`
        @keyframes cs-pulse-fade {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

    </div>
  )
}

function ModeBanner({ mode }: { mode: string }) {
  const isRecess = mode === 'recess'
  const bg = isRecess ? COLOR.warningBg : COLOR.dangerBg
  const fg = isRecess ? COLOR.warningText : COLOR.dangerText
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
    <button
      type="button"
      onClick={() => setOpen(o => !o)}
      style={{
        padding: '10px 12px',
        background: COLOR.surface1,
        borderRadius: 8,
        border: `0.5px solid ${highlight ? COLOR.warningBorder : COLOR.borderSubtle}`,
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
        color: 'inherit',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500 }}>{title}</div>
          <div style={{ fontSize: 11, color: COLOR.textMuted, marginTop: 2 }}>{summary}</div>
        </div>
        <span style={{ fontSize: 14, color: COLOR.textMuted }}>{open ? '▴' : '▾'}</span>
      </div>
      {open && (
        <div style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: `0.5px solid ${COLOR.borderSubtle}`,
          fontSize: 11,
          color: COLOR.textMuted,
        }}>
          Panel content goes here. Wire up the existing panel components or build inline.
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
    <div style={card()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={eyebrow({ marginBottom: 0 })}>QR code</div>
        {activeQR && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 8px', borderRadius: 999,
            background: COLOR.infoBg,
            color: COLOR.infoText,
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
        style={inputStyle()}
      />
      <input
        type="text"
        placeholder="Label"
        value={label}
        onChange={e => setLabel(e.target.value)}
        style={inputStyle()}
      />
      <button
        type="button"
        onClick={() => onPush(url, label)}
        disabled={!canControl || busy || !url}
        style={{
          ...touchBtn(),
          width: '100%',
          minHeight: 40,
        }}
      >
        Push QR
      </button>
      {activeQR && (
        <button
          type="button"
          onClick={onClear}
          disabled={!canControl || busy}
          style={{
            ...smallBtn(canControl),
            width: '100%',
            marginTop: 6,
          }}
        >
          Clear QR
        </button>
      )}
    </div>
  )
}

function card(): React.CSSProperties {
  return {
    background: COLOR.surface1,
    border: `0.5px solid ${COLOR.borderSubtle}`,
    borderRadius: 12,
    padding: '14px 16px',
  }
}

function eyebrow(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    fontSize: 11,
    color: COLOR.textMuted,
    letterSpacing: '0.05em',
    marginBottom: 6,
    ...extra,
  }
}

function touchBtn(): React.CSSProperties {
  return {
    minHeight: 44,
    padding: '12px 16px',
    borderRadius: 10,
    border: `0.5px solid ${COLOR.borderSubtle}`,
    background: COLOR.surface2,
    color: COLOR.textPrimary,
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  }
}

function touchBtnPrimary(): React.CSSProperties {
  return {
    ...touchBtn(),
    background: COLOR.brandPrimary,
    borderColor: COLOR.brandPrimary,
    color: '#fff',
  }
}

function smallBtn(enabled: boolean): React.CSSProperties {
  return {
    minHeight: 32,
    padding: '6px 12px',
    borderRadius: 8,
    border: `0.5px solid ${COLOR.borderSubtle}`,
    background: COLOR.surface2,
    color: COLOR.textPrimary,
    fontFamily: 'inherit',
    fontSize: 12,
    fontWeight: 500,
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.5,
  }
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%',
    background: COLOR.surface2,
    border: `0.5px solid ${COLOR.borderSubtle}`,
    borderRadius: 8,
    padding: '8px 10px',
    color: COLOR.textPrimary,
    fontSize: 12,
    marginBottom: 6,
    fontFamily: 'inherit',
  }
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
