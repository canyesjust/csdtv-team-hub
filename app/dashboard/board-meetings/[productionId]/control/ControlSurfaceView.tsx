'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AgendaPanel from './components/AgendaPanel'
import OnAirCard from './components/OnAirCard'
import TransportCard from './components/TransportCard'
import LowerThirdPanel from './components/LowerThirdPanel'
import QRPushPanel from './components/QRPushPanel'
import MotionAndVoteCard from './components/MotionAndVoteCard'
import UtilityPanel from './components/UtilityPanel'
import PreRollPanel from './components/PreRollPanel'
import ModesTimersPanel from './components/ModesTimersPanel'
import OutputChannelsPanel from './components/OutputChannelsPanel'
import AttendancePanel from './components/AttendancePanel'
import ModeBanner from './components/ModeBanner'
import type { ControlBundle } from '@/lib/board-meetings/types'

type Props = {
  productionId: string
  bundle: ControlBundle
  canControl: boolean
  onAction: (action: string, body?: unknown) => Promise<void>
  busy: boolean
  attendanceOpen: boolean
  onAttendanceOpenChange: (open: boolean) => void
}

export default function ControlSurfaceView({ productionId, bundle, canControl, onAction, busy, attendanceOpen, onAttendanceOpenChange }: Props) {
  const router = useRouter()
  const { meeting, broadcast_state, agenda_items, motion_lifecycle, attendance, lower_third_active, result_overlay } = bundle
  const meetingTitle = meeting?.title || 'Board Meeting'
  const status = broadcast_state?.status || 'draft'
  const mode = broadcast_state?.mode || 'normal'
  const isLive = status === 'live'

  const liveElapsed = isLive && broadcast_state?.live_started_at
    ? formatElapsed(Date.now() - new Date(broadcast_state.live_started_at).getTime())
    : null

  const goToMotion = () => router.push(`/control/${productionId}/motion`)
  const prodNum = meeting?.production_number

  return (
    <div className="control-surface">
      <div className="cs-header">
        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--brand-primary)', marginBottom: 8 }}>
          <Link href="/dashboard/board-meetings" style={{ color: 'inherit', textDecoration: 'none' }}>← Board Meetings</Link>
          {prodNum != null && (
            <Link href={`/dashboard/productions/${prodNum}?tab=boardmeeting`} style={{ color: 'inherit', textDecoration: 'none' }}>← Board Meeting tab</Link>
          )}
          <Link href={`/dashboard/board-meetings/${productionId}/buttons`} style={{ color: 'inherit', textDecoration: 'none' }}>Companion buttons →</Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>Control surface · {meetingTitle}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {isLive && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 999,
                background: 'var(--semantic-danger-bg)',
                color: 'var(--semantic-danger-text)',
                fontSize: 11, fontWeight: 500,
              }}>
                <span className="cs-pulse-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--semantic-danger-text)' }} />
                LIVE{liveElapsed ? ` · ${liveElapsed}` : ''}
              </span>
            )}
            {attendance && (
              <AttendancePanel
                attendance={attendance}
                quorumNeeded={meeting?.quorum_size || 4}
                canEdit={canControl}
                onMark={() => onAttendanceOpenChange(true)}
              />
            )}
          </div>
        </div>
      </div>

      {!canControl && (
        <p className="control-banner">Lock the agenda before using broadcast controls.</p>
      )}

      {mode !== 'normal' && (
        <ModeBanner mode={mode} timer={broadcast_state?.mode_ends_at} />
      )}

      <div className="cs-main">
        <div className="cs-agenda">
          <div className="cs-eyebrow" style={{ paddingLeft: 4 }}>AGENDA</div>
          <AgendaPanel
            items={agenda_items}
            currentItemId={broadcast_state?.current_agenda_item_id}
            disabled={!canControl || busy}
            onJump={(itemId) => onAction('jump-to', { agenda_item_id: itemId })}
          />
        </div>

        <div className="cs-onair">
          <OnAirCard
            item={getCurrentAgendaItem(agenda_items, broadcast_state?.current_agenda_item_id)}
            isLive={isLive}
          />

          <TransportCard
            canControl={canControl}
            isLive={isLive}
            agendaOverlayOn={broadcast_state?.agenda_overlay_visible !== false}
            busy={busy}
            onBack={() => onAction('go-back')}
            onAdvance={() => onAction('advance')}
            onToggleOverlay={() => onAction('toggle-overlay')}
            onGoLive={() => onAction('go-live')}
          />

          <LowerThirdPanel
            active={lower_third_active}
            people={bundle.lower_third_people || []}
            canControl={canControl && !busy}
            onSet={(personId) => onAction('set-lower-third', { person_id: personId })}
            onClear={() => onAction('clear-lower-third')}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <QRPushPanel
              canControl={canControl && isLive}
              activeQR={broadcast_state?.active_qr_url}
              onPush={(url, label) => onAction('push-qr', { custom_url: url, custom_label: label })}
              onClear={() => onAction('clear-qr')}
            />
            <MotionAndVoteCard
              lifecycle={motion_lifecycle}
              resultOverlay={result_overlay}
              isLive={isLive}
              onOpenMotion={goToMotion}
              onContinueMotion={goToMotion}
              onPushResult={
                motion_lifecycle?.active_motion?.id
                  ? () => onAction(`motion/${motion_lifecycle.active_motion!.id}/push-result`)
                  : undefined
              }
              onHoldResult={() => onAction('hold-result')}
              onDismissResult={() => onAction('dismiss-result')}
            />
          </div>

          {isLive && (
            <div style={{ marginTop: 6, paddingTop: 10, borderTop: '0.5px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="cs-touchbtn cs-touchbtn-danger"
                onClick={() => onAction('end-meeting')}
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
          <UtilityPanel title="Pre-roll" summary={summarizePreRoll(bundle.playlist_state)} icon="playlist">
            <PreRollPanel canControl={canControl} state={bundle.playlist_state} meetingPlaylist={bundle.meeting_playlist} onAction={onAction} />
          </UtilityPanel>
          <UtilityPanel
            title="Modes & timers"
            summary={summarizeModesTimers(broadcast_state, bundle.active_timer)}
            icon="clock"
            forceOpen={mode !== 'normal' || !!bundle.active_timer}
          >
            <ModesTimersPanel canControl={canControl} state={broadcast_state} timer={bundle.active_timer} templates={bundle.timer_templates} onAction={onAction} />
          </UtilityPanel>
          <UtilityPanel title="Output channels" summary={summarizeChannels(bundle.channel_assignments, bundle.channels)} icon="broadcast">
            <OutputChannelsPanel canControl={canControl} channels={bundle.channels} assignments={bundle.channel_assignments} onAction={onAction} />
          </UtilityPanel>
        </div>
      </div>

      <AttendancePanel
        productionId={productionId}
        disabled={!canControl}
        open={attendanceOpen}
        onOpenChange={onAttendanceOpenChange}
        hideTrigger
      />
    </div>
  )
}

function getCurrentAgendaItem(items: ControlBundle['agenda_items'], currentId: string | undefined | null) {
  if (!currentId) return null
  return (items || []).find(i => i.id === currentId) || null
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function summarizePreRoll(state: ControlBundle['playlist_state']): string {
  if (!state) return 'No playlist'
  if (state.playback_state === 'playing') return 'Playlist playback'
  if (state.playback_state === 'paused') return 'Paused'
  if (state.playback_state === 'held') return 'Held'
  return 'Idle'
}

function summarizeModesTimers(state: ControlBundle['broadcast_state'], timer: ControlBundle['active_timer']): string {
  const parts: string[] = []
  if (state?.mode && state.mode !== 'normal') parts.push(state.mode.replace('_', ' '))
  if (timer) parts.push('timer running')
  return parts.length ? parts.join(' · ') : 'Recess, tech diff, timers'
}

function summarizeChannels(assignments: ControlBundle['channel_assignments'], channels: ControlBundle['channels']): string {
  const total = (channels || []).length || 8
  const active = (assignments || []).length
  return `${active} of ${total} assigned`
}

