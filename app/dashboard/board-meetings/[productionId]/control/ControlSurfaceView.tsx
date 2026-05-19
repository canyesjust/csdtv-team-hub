'use client'

import { useEffect, useState } from 'react'
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
  const elapsedStartedAt = broadcast_state?.elapsed_started_at ?? null
  const [clockNowMs, setClockNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!elapsedStartedAt) return
    const id = setInterval(() => setClockNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [elapsedStartedAt])

  const goToMotion = () => router.push(`/control/${productionId}/motion`)
  const prodNum = meeting?.production_number

  const quorumMet = attendance?.quorum?.quorum_met
  const presentCount = attendance?.quorum?.present_count

  const activeQR = resolveActiveQR(broadcast_state)
  const hasCurrentDocument = (bundle.current_documents || []).some(d => !!d.source_url)
  const hasYoutube = !!bundle.production?.livestream_url

  return (
    <div className="control-surface">
      <div className="cs-header">
        <div className="cs-header-breadcrumbs">
          <Link href="/dashboard/board-meetings">← Board Meetings</Link>
          {prodNum != null ? (
            <Link href={`/dashboard/productions/${prodNum}?tab=boardmeeting`}>← Board Meeting tab</Link>
          ) : null}
          <Link href={`/dashboard/board-meetings/${productionId}/buttons`}>Companion buttons →</Link>
        </div>

        <div className="cs-header-title">Control surface · {meetingTitle}</div>

        <div className="cs-header-status-row">
          {isLive ? (
            <span className="cs-live-pill">
              <span className="cs-pulse-dot cs-onair-pulse" aria-hidden="true" />
              LIVE
            </span>
          ) : null}

          {attendance ? (
            <span className="cs-attendance-text">
              {presentCount} present
              <span aria-hidden="true"> · </span>
              <span className={quorumMet ? 'cs-quorum-met-text' : 'cs-quorum-unmet-text'}>
                quorum {quorumMet ? 'met' : 'not met'}
              </span>
            </span>
          ) : null}

          <button
            type="button"
            className="cs-touchbtn cs-touchbtn-small"
            onClick={() => onAttendanceOpenChange(true)}
            disabled={!canControl}
          >
            Mark attendance
          </button>
        </div>
      </div>

      {!canControl ? (
        <p className="control-banner">Lock the agenda before using broadcast controls.</p>
      ) : null}

      {mode !== 'normal' ? (
        <ModeBanner mode={mode} timer={broadcast_state?.mode_ends_at} />
      ) : null}

      <div className="cs-main">
        <div className="cs-agenda">
          <div className="cs-eyebrow" style={{ paddingLeft: 4 }}>AGENDA</div>
          <AgendaPanel
            items={agenda_items}
            currentItemId={broadcast_state?.current_agenda_item_id}
            brandingHold={!!broadcast_state?.agenda_branding_hold}
            disabled={!canControl}
            onJump={(itemId) => onAction('jump-to', { agenda_item_id: itemId })}
            onBrandingHold={() => onAction('show-agenda-branding')}
          />
        </div>

        <div className="cs-onair">
          <OnAirCard
            item={getCurrentAgendaItem(agenda_items, broadcast_state?.current_agenda_item_id)}
            brandingHold={!!broadcast_state?.agenda_branding_hold}
            isLive={isLive}
          />

          <TransportCard
            canControl={canControl}
            isLive={isLive}
            agendaOverlayOn={broadcast_state?.agenda_overlay_visible !== false}
            busy={busy}
            elapsedStartedAt={elapsedStartedAt}
            clockNowMs={clockNowMs}
            onBack={() => onAction('go-back')}
            onAdvance={() => onAction('advance')}
            onToggleOverlay={() => onAction('toggle-overlay')}
            onGoLive={() => onAction('go-live')}
            onStartElapsed={() => onAction('reset-elapsed')}
            onResetElapsed={() => onAction('reset-elapsed')}
            onClearElapsed={() => onAction('clear-elapsed')}
          />

          <LowerThirdPanel
            active={lower_third_active}
            people={bundle.lower_third_people || []}
            position={broadcast_state?.lower_third_position ?? 'left'}
            canControl={canControl}
            onSet={(person) =>
              onAction('set-lower-third', {
                person_id: person.id,
                person,
                position: broadcast_state?.lower_third_position ?? 'left',
              })
            }
            onPositionChange={pos => onAction('set-lower-third-position', { position: pos })}
            onClear={() => onAction('clear-lower-third')}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <QRPushPanel
              canControl={canControl && isLive}
              activeQR={activeQR}
              hasCurrentDocument={hasCurrentDocument}
              hasYoutube={hasYoutube}
              onPush={(payload) => onAction('push-qr', payload)}
              onExtend={(seconds) => onAction('extend-qr', { additional_seconds: seconds })}
              onDismiss={() => onAction('clear-qr')}
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

          {isLive ? (
            <div className="cs-end-meeting-row">
              <button
                type="button"
                className="cs-touchbtn cs-touchbtn-danger"
                onClick={() => onAction('end-meeting')}
                disabled={!canControl}
              >
                End meeting
              </button>
            </div>
          ) : null}
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

function resolveActiveQR(state: ControlBundle['broadcast_state']) {
  if (!state?.active_qr_url) return null
  return {
    url: state.active_qr_url,
    label: state.active_qr_label ?? null,
    startedAt: state.active_qr_started_at ?? null,
    durationSeconds: state.active_qr_duration_seconds ?? null,
  }
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