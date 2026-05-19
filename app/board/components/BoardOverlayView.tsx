'use client'

import { useEffect, useState } from 'react'
import type { PublicChannelState } from '@/lib/board-meetings/public-output-state'
import { useBoardChannelState } from '@/app/board/hooks/useBoardChannelState'
import type { PublicActiveMotion, PublicActiveVoteResult } from '@/lib/board-meetings/motion-types'
import { formatOffsetSeconds } from '@/lib/board-meetings/time-format'
import BoardIdleBranding from '@/app/board/components/BoardIdleBranding'
import LowerThirdBanner from '@/app/board/components/LowerThirdBanner'
import {
  overlayPanelStyle,
  OVERLAY_PANEL_BG,
  OVERLAY_TEXT_MUTED,
  OVERLAY_TEXT_PRIMARY,
  OVERLAY_TEXT_SUBTLE,
} from '@/app/board/overlay-graphics'

function ModeBanner({ accent, title, message }: { accent: string; title: string; message: string | null }) {
  return (
    <div
      className="obs-overlay-graphic"
      style={overlayPanelStyle({
        background: `linear-gradient(135deg, ${accent} 0%, ${OVERLAY_PANEL_BG} 100%)`,
        padding: '32px 40px',
        borderRadius: '8px',
        color: '#fff',
        maxWidth: '640px',
      })}
    >
      <p style={{ margin: 0, fontSize: '32px', fontWeight: 700 }}>{title}</p>
      {message ? <p style={{ margin: '12px 0 0', fontSize: '18px', color: OVERLAY_TEXT_MUTED }}>{message}</p> : null}
    </div>
  )
}

function QrOverlay({ url, label }: { url: string; label: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void import('qrcode').then(({ default: QR }) => {
      QR.toDataURL(url, { width: 220, margin: 1 }).then(img => {
        if (!cancelled) setDataUrl(img)
      })
    })
    return () => { cancelled = true }
  }, [url])

  return (
    <div
      className="obs-overlay-graphic"
      style={overlayPanelStyle({
        position: 'absolute',
        bottom: '32px',
        right: '32px',
        padding: '16px',
        borderRadius: '12px',
        textAlign: 'center',
        color: OVERLAY_TEXT_PRIMARY,
        fontFamily: 'system-ui, sans-serif',
        zIndex: 20,
      })}
    >
      {dataUrl ? (
        <img src={dataUrl} alt="QR code" width={220} height={220} style={{ display: 'block' }} />
      ) : (
        <div style={{ width: 220, height: 220, background: '#334155' }} />
      )}
      <p style={{ margin: '12px 0 0', fontSize: '16px', fontWeight: 600, maxWidth: '220px' }}>{label}</p>
    </div>
  )
}

export default function BoardOverlayView({
  channelNumber,
  initialChannelName,
}: {
  channelNumber: number
  initialChannelName?: string
}) {
  const state = useBoardChannelState(channelNumber, { livePriority: true })

  const stackAnchor: React.CSSProperties = {
    position: 'absolute',
    top: '24px',
    left: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxWidth: 'min(720px, calc(100vw - 48px))',
    fontFamily: 'system-ui, sans-serif',
  }

  const screenName = state?.channel_name || initialChannelName || `Channel ${channelNumber}`

  if (!state?.active) {
    return <BoardIdleBranding screenName={screenName} variant="overlay" />
  }

  const b = state.state
  const item = state.current_item
  const mode = b?.mode || 'normal'
  const voteResult = b?.active_vote_result
  const activeMotion = b?.active_motion
  const showVoteResult =
    !!voteResult &&
    (!!voteResult.held || !!state.result_overlay?.held || (voteResult.remaining_seconds ?? 0) > 0)
  const showMotion = !showVoteResult && !!activeMotion
  const showItem = b?.overlay_visible && mode === 'normal' && item && !showVoteResult && !showMotion
  const timer = state.timer
  const showTimer = timer?.show_on_broadcast && (timer.remaining_seconds ?? 0) > 0
  const qr = b?.active_qr
  const lowerThird = b?.active_lower_third
  const showLowerThird = !!lowerThird && mode !== 'technical_difficulties'
  const showIdleBranding =
    mode === 'normal' && !showVoteResult && !showMotion && !showItem && !showTimer && !qr && !lowerThird

  if (mode === 'recess') {
    return (
      <>
        <div style={stackAnchor}>
          <ModeBanner accent="#1e4a8a" title="Recess" message={b?.mode_message ?? null} />
        </div>
        {qr && <QrOverlay url={qr.url} label={qr.label} />}
        {showLowerThird && lowerThird ? <LowerThirdBanner person={lowerThird} variant="overlay" /> : null}
      </>
    )
  }

  if (mode === 'technical_difficulties') {
    return (
      <>
        <div style={stackAnchor}>
          <ModeBanner accent="#8b1a1a" title="Technical Difficulties" message={b?.mode_message ?? null} />
        </div>
        {qr && <QrOverlay url={qr.url} label={qr.label} />}
      </>
    )
  }

  if (showIdleBranding) {
    return <BoardIdleBranding screenName={screenName} variant="overlay" statusLine={null} />
  }

  return (
    <>
      {(showVoteResult || showMotion || showItem) ? (
        <div style={stackAnchor}>
          {showVoteResult && voteResult ? <VoteResultCard result={voteResult} /> : null}
          {showMotion && activeMotion ? <MotionCard motion={activeMotion} /> : null}
          {showItem && item ? (
            <div
              className="obs-overlay-graphic"
              style={overlayPanelStyle({
                borderLeft: '4px solid #3b82f6',
                padding: '16px 20px',
                borderRadius: '4px',
                color: OVERLAY_TEXT_PRIMARY,
              })}
            >
              <p style={{ margin: '0 0 4px', fontSize: '13px', color: OVERLAY_TEXT_SUBTLE, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {item.section_title} · {item.item_number}
              </p>
              <p style={{ margin: 0, fontSize: '22px', fontWeight: 600, lineHeight: 1.3 }}>{item.title}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      {showTimer && timer ? <TimerBadge timer={timer} /> : null}
      {qr && <QrOverlay url={qr.url} label={qr.label} />}
      {showLowerThird && lowerThird ? <LowerThirdBanner person={lowerThird} variant="overlay" /> : null}
    </>
  )
}

function MotionCard({ motion }: { motion: PublicActiveMotion }) {
  const isVoting = motion.status === 'voting'
  const hasMover = !!motion.moved_by_name
  const hasSeconder = !!motion.seconded_by_name
  const text = motion.motion_text.length > 200 ? `${motion.motion_text.slice(0, 200)}…` : motion.motion_text
  const label = isVoting
    ? 'Voting open'
    : !hasMover
      ? 'Motion being made'
      : motion.motion_type === 'substitute'
        ? 'Substitute motion'
        : 'Motion on floor'

  return (
    <div
      className="obs-overlay-graphic"
      style={overlayPanelStyle({
        borderLeft: `4px solid ${isVoting ? '#60a5fa' : '#f59e0b'}`,
        padding: '16px 20px',
        borderRadius: '4px',
        color: OVERLAY_TEXT_PRIMARY,
      })}
    >
      <p style={{ margin: '0 0 8px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isVoting ? '#93c5fd' : '#fbbf24' }}>
        {label}
        {motion.is_consent_block && motion.consent_block_label ? ` · ${motion.consent_block_label}` : ''}
      </p>
      {hasMover && <p style={{ margin: '0 0 10px', fontSize: '20px', fontWeight: 600, lineHeight: 1.35 }}>{text}</p>}
      {hasMover && hasSeconder && (
        <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>
          {motion.moved_by_name}, seconded by {motion.seconded_by_name}
        </p>
      )}
      {hasMover && !hasSeconder && (
        <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>Moved by {motion.moved_by_name}</p>
      )}
    </div>
  )
}

function VoteResultCard({ result }: { result: PublicActiveVoteResult }) {
  const passed = result.result === 'passed'
  const yeaNames = result.votes.filter(v => v.vote === 'yea').map(v => v.person_name)
  const nayNames = result.votes.filter(v => v.vote === 'nay').map(v => v.person_name)
  return (
    <div
      className="obs-overlay-graphic"
      style={overlayPanelStyle({
        maxWidth: '480px',
        padding: '14px 18px',
        borderRadius: '6px',
        color: OVERLAY_TEXT_PRIMARY,
        border: `2px solid ${passed ? '#22c55e' : '#ef4444'}`,
      })}
    >
      <p style={{ margin: '0 0 6px', fontSize: '12px', lineHeight: 1.35, color: OVERLAY_TEXT_MUTED }}>
        {result.motion_text.slice(0, 80)}
        {result.motion_text.length > 80 ? '…' : ''}
      </p>
      <p style={{ margin: '0 0 4px', fontSize: '22px', fontWeight: 800, letterSpacing: '0.02em', color: passed ? '#4ade80' : '#f87171' }}>
        MOTION {passed ? 'PASSED' : 'FAILED'}
      </p>
      <p style={{ margin: '0 0 10px', fontSize: '18px', fontWeight: 700 }}>
        {result.tally.yea} — {result.tally.nay}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px', lineHeight: 1.35 }}>
        <div><strong>Yea:</strong> {yeaNames.join(', ') || '—'}</div>
        <div><strong>Nay:</strong> {nayNames.join(', ') || '—'}</div>
      </div>
    </div>
  )
}

function TimerBadge({ timer }: { timer: NonNullable<PublicChannelState['timer']> }) {
  return (
    <div
      className="obs-overlay-graphic"
      style={overlayPanelStyle({
        position: 'absolute',
        top: '24px',
        right: '24px',
        padding: '12px 18px',
        borderRadius: '8px',
        color: OVERLAY_TEXT_PRIMARY,
        fontFamily: 'monospace',
        fontSize: '28px',
        fontWeight: 700,
      })}
    >
      {timer.label}: {formatOffsetSeconds(timer.remaining_seconds)}
    </div>
  )
}
