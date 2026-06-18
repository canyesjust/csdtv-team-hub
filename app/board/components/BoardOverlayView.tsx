'use client'

import { useEffect, useRef, useState } from 'react'
import type { PublicChannelState } from '@/lib/board-meetings/public-output-state'
import { useBoardChannelState } from '@/app/board/hooks/useBoardChannelState'
import BoardOutputDebugStrip from '@/app/board/components/BoardOutputDebugStrip'
import type { PublicActiveVoteResult } from '@/lib/board-meetings/motion-types'
import { formatOffsetSeconds } from '@/lib/board-meetings/time-format'
import BoardBrandingSlide from '@/app/board/components/BoardBrandingSlide'
import BoardIdleBranding from '@/app/board/components/BoardIdleBranding'
import { BoardBlankOverlay } from '@/app/board/components/BoardBlankOutput'
import { overlayShouldShowChannelIdent } from '@/app/board/lib/channel-ident'
import LowerThirdBanner from '@/app/board/components/LowerThirdBanner'
import {
  overlayPanelStyle,
  OVERLAY_TEXT_MUTED,
  OVERLAY_TEXT_PRIMARY,
  OVERLAY_TEXT_SUBTLE,
} from '@/app/board/overlay-graphics'
import { OverlayMotionCard, OverlayVoteSidePanel, fitMotionText, motionTextFitStyle } from '@/app/board/components/MotionFloorGraphics'
import { useActivePublicQr } from '@/app/board/hooks/useActivePublicQr'
import { CANYONS_LOGO_SRC } from '@/app/board/branding-assets'

/**
 * Recess / technical-difficulties take over the WHOLE overlay with an opaque
 * cover, so the program cameras behind the overlay are hidden in OBS. Shows a
 * countdown when the operator set a recess duration.
 */
function OverlayFullScreenMode({ title, message, accent, startedAt, durationSeconds }: {
  title: string
  message: string | null
  accent: string
  startedAt?: string | null
  durationSeconds?: number | null
}) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (!startedAt || !durationSeconds) return
    const id = setInterval(() => setNowMs(Date.now()), 250)
    return () => clearInterval(id)
  }, [startedAt, durationSeconds])
  let countdown: string | null = null
  if (startedAt && durationSeconds) {
    const remaining = durationSeconds - (nowMs - new Date(startedAt).getTime()) / 1000
    if (remaining > 0) countdown = formatOffsetSeconds(Math.ceil(remaining))
  }
  return (
    <div
      className="obs-overlay-graphic gfx-fade is-in"
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'radial-gradient(circle at 50% 32%, #15243f 0%, #060b14 72%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '28px', textAlign: 'center',
      }}
    >
      <img src={CANYONS_LOGO_SRC} alt="" style={{ height: '9vh', opacity: 0.95 }} />
      <div style={{ width: '72px', height: '4px', borderRadius: 999, background: accent }} />
      <p style={{ margin: 0, fontSize: 'min(8vh, 6vw)', fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.01em' }}>{title}</p>
      {message ? <p style={{ margin: 0, fontSize: 'min(3.4vh, 2.6vw)', color: '#94a3b8', maxWidth: '70vw' }}>{message}</p> : null}
      {countdown ? (
        <p style={{ margin: 0, fontFamily: 'ui-monospace, monospace', fontSize: 'min(7vh, 5vw)', fontWeight: 700, color: accent, fontVariantNumeric: 'tabular-nums' }}>{countdown}</p>
      ) : null}
    </div>
  )
}

/**
 * Keeps a graphic mounted long enough to play an exit animation when it is
 * dismissed, instead of cutting it off the screen. The wrapper is a full-stage
 * transparent layer (see overlay-transparent.css) so the child's own absolute
 * positioning is preserved while opacity/transform composite over it.
 *
 * `animKey` re-triggers the entrance animation when the content changes while
 * still showing (e.g. swapping from one speaker's lower third to another).
 */
const GFX_EXIT_MS = 460

function GraphicReveal({
  show,
  variant,
  animKey,
  children,
}: {
  show: boolean
  variant: 'lower-third' | 'stack-left' | 'pop' | 'badge'
  animKey?: string | number | null
  children: React.ReactNode
}) {
  const [rendered, setRendered] = useState(show)
  const [phase, setPhase] = useState<'in' | 'out'>(show ? 'in' : 'out')
  // What we actually paint. While shown it tracks the live content; on hide it
  // freezes the last shown content so the exit animation has something to play.
  const [held, setHeld] = useState<React.ReactNode>(children)
  const lastShown = useRef<React.ReactNode>(children)

  // Keep a snapshot of the most recent *shown* content (refs touched only in effects).
  useEffect(() => {
    if (show) lastShown.current = children
  })

  useEffect(() => {
    if (show) {
      setHeld(children)
      setRendered(true)
      setPhase('in')
    } else if (rendered) {
      setHeld(lastShown.current)
      setPhase('out')
      const t = setTimeout(() => setRendered(false), GFX_EXIT_MS)
      return () => clearTimeout(t)
    }
  }, [show, rendered, children])

  if (!rendered) return null
  return (
    <div key={animKey ?? undefined} className={`gfx-reveal gfx-${variant} ${phase === 'out' ? 'is-out' : 'is-in'}`}>
      {held}
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
  const { state, debugInfo } = useBoardChannelState(channelNumber, { livePriority: true })
  const visibleQr = useActivePublicQr(state?.state?.active_qr ?? null)

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
    return <BoardBlankOverlay />
  }

  const b = state.state

  /** Overlay off = fully transparent output for OBS (no graphics of any kind). */
  if (b?.overlay_visible === false) {
    return null
  }

  const item = state.current_item
  const mode = b?.mode || 'normal'
  const voteResult = b?.active_vote_result
  const activeMotion = b?.active_motion
  const showVoteResult =
    !!voteResult &&
    (!!voteResult.held || !!state.result_overlay?.held || (voteResult.remaining_seconds ?? 0) > 0)
  const showMotion = !showVoteResult && !!activeMotion
  const motionIsVoting = showMotion && activeMotion?.status === 'voting'
  const brandingHold = !!(state.agenda_branding_hold || b?.agenda_branding_hold)
  const showItem =
    b?.overlay_visible && mode === 'normal' && item && !showVoteResult && !showMotion && !brandingHold
  const showBrandingHold = brandingHold && mode === 'normal' && !showVoteResult && !showMotion
  const timer = state.timer
  const showTimer = timer?.show_on_broadcast && (timer.remaining_seconds ?? 0) > 0
  const lowerThird = b?.active_lower_third
  const showLowerThird = !!lowerThird && mode !== 'technical_difficulties'
  if (mode === 'recess') {
    return (
      <OverlayFullScreenMode
        title="Recess"
        message={b?.mode_message ?? "We'll return shortly."}
        accent="#38bdf8"
        startedAt={b?.mode_started_at}
        durationSeconds={b?.mode_duration_seconds}
      />
    )
  }

  if (mode === 'technical_difficulties') {
    return (
      <OverlayFullScreenMode
        title="Technical Difficulties"
        message={b?.mode_message ?? 'Please stand by.'}
        accent="#f87171"
      />
    )
  }

  if (state && overlayShouldShowChannelIdent(state)) {
    return <BoardIdleBranding screenName={screenName} variant="overlay" statusLine={null} />
  }

  if (showBrandingHold) {
    return (
      <>
        <div style={stackAnchor}>
          <div
            className="obs-overlay-graphic"
            style={overlayPanelStyle({
              padding: '16px 20px',
              borderRadius: '8px',
              color: OVERLAY_TEXT_PRIMARY,
            })}
          >
            <BoardBrandingSlide variant="overlay-corner" />
          </div>
        </div>
        <GraphicReveal show={!!showTimer && !!timer} variant="badge">
          {timer ? <TimerBadge timer={timer} /> : null}
        </GraphicReveal>
        <GraphicReveal show={!!visibleQr} variant="badge" animKey={visibleQr?.url}>
          {visibleQr ? <QrOverlay url={visibleQr.url} label={visibleQr.label} /> : null}
        </GraphicReveal>
        <GraphicReveal show={!!showLowerThird && !!lowerThird} variant="lower-third" animKey={lowerThird?.person_id}>
          {lowerThird ? (
            <LowerThirdBanner person={lowerThird} variant="overlay" position={b?.lower_third_position ?? 'left'} />
          ) : null}
        </GraphicReveal>
      </>
    )
  }

  const showStack = !!(showVoteResult || (showMotion && !motionIsVoting) || showItem)
  const stackKey = showVoteResult
    ? `vote:${voteResult?.result ?? ''}:${voteResult?.tally.yea ?? ''}-${voteResult?.tally.nay ?? ''}`
    : showMotion && activeMotion
      ? `motion:${activeMotion.id}:${activeMotion.status}`
      : showItem && item
        ? `item:${item.id}`
        : 'none'

  return (
    <>
      {motionIsVoting && activeMotion ? (
        <OverlayVoteSidePanel motion={activeMotion} item={item} />
      ) : null}
      <GraphicReveal show={showStack} variant={showVoteResult ? 'pop' : 'stack-left'} animKey={stackKey}>
        <div style={stackAnchor}>
          {showVoteResult && voteResult ? <VoteResultCard result={voteResult} /> : null}
          {showMotion && activeMotion && !motionIsVoting ? (
            <OverlayMotionCard motion={activeMotion} item={item} />
          ) : null}
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
      </GraphicReveal>
      <GraphicReveal show={!!showTimer && !!timer} variant="badge">
        {timer ? <TimerBadge timer={timer} /> : null}
      </GraphicReveal>
      <GraphicReveal show={!!visibleQr} variant="badge" animKey={visibleQr?.url}>
        {visibleQr ? <QrOverlay url={visibleQr.url} label={visibleQr.label} /> : null}
      </GraphicReveal>
      <GraphicReveal show={!!showLowerThird && !!lowerThird} variant="lower-third" animKey={lowerThird?.person_id}>
        {lowerThird ? (
          <LowerThirdBanner person={lowerThird} variant="overlay" position={b?.lower_third_position ?? 'left'} />
        ) : null}
      </GraphicReveal>
      {debugInfo ? <BoardOutputDebugStrip info={debugInfo} pollMs={state.poll_interval_ms} /> : null}
    </>
  )
}

function VoteResultCard({ result }: { result: PublicActiveVoteResult }) {
  const passed = result.result === 'passed'
  const yeaNames = result.votes.filter(v => v.vote === 'yea').map(v => v.person_name)
  const nayNames = result.votes.filter(v => v.vote === 'nay').map(v => v.person_name)
  const abstainNames = result.votes.filter(v => v.vote === 'abstain').map(v => v.person_name)
  const absentNames = result.votes.filter(v => v.vote === 'absent' || v.vote === 'recused').map(v => v.person_name)
  const motionText = fitMotionText(result.motion_text)
  return (
    <div
      className="obs-overlay-graphic"
      style={overlayPanelStyle({
        maxWidth: 'min(480px, calc(100vw - 48px))',
        overflow: 'hidden',
        padding: '14px 18px',
        borderRadius: '6px',
        color: OVERLAY_TEXT_PRIMARY,
        border: `2px solid ${passed ? '#22c55e' : '#ef4444'}`,
      })}
    >
      <p style={{ ...motionTextFitStyle(motionText, 'overlay-result'), margin: '0 0 8px', color: OVERLAY_TEXT_MUTED }}>
        {motionText}
      </p>
      <p style={{ margin: '0 0 4px', fontSize: '22px', fontWeight: 800, letterSpacing: '0.02em', color: passed ? '#4ade80' : '#f87171' }}>
        MOTION {passed ? 'PASSED' : 'FAILED'}
      </p>
      <p style={{ margin: '0 0 10px', fontSize: '18px', fontWeight: 700 }}>
        {result.tally.yea} — {result.tally.nay}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '15px', lineHeight: 1.4 }}>
        <div><strong>Aye:</strong> {yeaNames.join(', ') || '—'}</div>
        <div><strong>Nay:</strong> {nayNames.join(', ') || '—'}</div>
        {abstainNames.length > 0 && <div><strong>Abstain:</strong> {abstainNames.join(', ')}</div>}
        {absentNames.length > 0 && (
          <div style={{ color: OVERLAY_TEXT_MUTED }}><strong>Absent:</strong> {absentNames.join(', ')}</div>
        )}
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
