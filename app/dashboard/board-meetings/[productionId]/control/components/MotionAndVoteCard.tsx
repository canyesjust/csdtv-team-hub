'use client'

import { useRouter } from 'next/navigation'
import type { MotionLifecycleState, ResultOverlayState } from '@/lib/board-meetings/types'

type Props = {
  lifecycle: MotionLifecycleState | null
  resultOverlay: ResultOverlayState | null
  canControl: boolean
  onPushResult?: () => void
  onHoldResult: () => void
  onDismissResult: () => void
  motionHref: string
}

export default function MotionAndVoteCard(props: Props) {
  const {
    lifecycle,
    resultOverlay,
    canControl,
    onPushResult,
    onHoldResult,
    onDismissResult,
    motionHref,
  } = props

  if (resultOverlay?.active) {
    return <StateC overlay={resultOverlay} onHold={onHoldResult} onDismiss={onDismissResult} />
  }

  if (lifecycle?.state === 'voted') {
    return (
      <StateVotedPending lifecycle={lifecycle} motionHref={motionHref} onPushResult={onPushResult} />
    )
  }

  if (lifecycle && !['no_motion', 'closed', 'pushed'].includes(lifecycle.state)) {
    return <StateB lifecycle={lifecycle} motionHref={motionHref} />
  }

  return <StateA canControl={canControl} motionHref={motionHref} />
}

function StateA({ canControl, motionHref }: { canControl: boolean; motionHref: string }) {
  const router = useRouter()
  return (
    <div className="cs-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <span className="cs-eyebrow" style={{ marginBottom: 0 }}>Motion &amp; vote</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>no motion on floor</span>
      </div>
      <button
        type="button"
        className="cs-touchbtn"
        disabled={!canControl}
        onClick={() => router.push(motionHref)}
        style={{
          width: '100%',
          minHeight: 44,
          opacity: canControl ? 1 : 0.5,
          cursor: canControl ? 'pointer' : 'not-allowed',
        }}
      >
        Open motion screen →
      </button>
    </div>
  )
}

function StateVotedPending({
  lifecycle,
  motionHref,
  onPushResult,
}: {
  lifecycle: MotionLifecycleState
  motionHref: string
  onPushResult?: () => void
}) {
  const router = useRouter()
  const motion = lifecycle.active_motion
  const text = motion?.text || 'Motion'
  const moverName = motion?.mover_name || '—'
  const seconderName = motion?.seconder_name || '—'

  return (
    <div className="cs-card" style={{ borderColor: 'var(--semantic-info-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--semantic-info-text)', letterSpacing: '0.05em', fontWeight: 500 }}>
          Vote complete
        </div>
        <span style={{
          fontSize: 10, padding: '2px 6px', borderRadius: 999,
          background: 'var(--semantic-info-bg)',
          color: 'var(--semantic-info-text)',
          fontWeight: 500,
        }}>VOTED</span>
      </div>
      <div style={{ fontSize: 11, marginBottom: 4, lineHeight: 1.35, color: 'var(--text-primary)' }}>
        {truncate(text, 60)}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10 }}>
        {moverName} / {seconderName}
      </div>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '0 0 10px' }}>
        Push the result to the overlay to show the countdown banner.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {onPushResult ? (
          <button type="button" onClick={onPushResult} className="cs-touchbtn cs-touchbtn-primary" style={{ width: '100%', minHeight: 44 }}>
            Push result to overlay
          </button>
        ) : null}
        <button
          type="button"
          className="cs-touchbtn"
          onClick={() => router.push(motionHref)}
          style={{ width: '100%', minHeight: 44 }}
        >
          Open motion screen →
        </button>
      </div>
    </div>
  )
}

function StateB({ lifecycle, motionHref }: { lifecycle: MotionLifecycleState; motionHref: string }) {
  const router = useRouter()
  const status = lifecycle.state
  const statusLabel =
    status === 'drafting' ? 'DRAFTING'
      : status === 'open_for_discussion' ? 'DISCUSSION'
        : status === 'voting' ? 'VOTING'
          : status === 'voted' ? 'VOTED'
            : status.toUpperCase()
  const motion = lifecycle.active_motion
  const isSubstitute = motion?.motion_type === 'substitute'
  const text = motion?.text || 'Motion'
  const moverName = motion?.mover_name || '—'
  const seconderName = motion?.seconder_name || '—'
  const voteCount = lifecycle.recorded_votes_count || 0

  return (
    <div className="cs-card" style={{ borderColor: 'var(--semantic-warning-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--semantic-warning-text)', letterSpacing: '0.05em', fontWeight: 500 }}>
          {isSubstitute ? 'Substitute motion' : 'Motion in progress'}
        </div>
        <span style={{
          fontSize: 10, padding: '2px 6px', borderRadius: 999,
          background: 'var(--semantic-warning-bg)',
          color: 'var(--semantic-warning-text)',
          fontWeight: 500,
        }}>{statusLabel}</span>
      </div>
      <div style={{ fontSize: 11, marginBottom: 4, lineHeight: 1.35, color: 'var(--text-primary)' }}>
        {truncate(text, 60)}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10 }}>
        {moverName} / {seconderName}
        {status === 'voting' ? ` · ${voteCount} votes recorded` : ''}
        {isSubstitute ? ' · main held' : ''}
      </div>
      <button
        type="button"
        className="cs-touchbtn"
        onClick={() => router.push(motionHref)}
        style={{
          width: '100%',
          minHeight: 44,
          background: 'var(--semantic-warning-bg)',
          color: 'var(--semantic-warning-text)',
          borderColor: 'var(--semantic-warning-border)',
          fontWeight: 500,
        }}
      >
        Continue motion →
      </button>
    </div>
  )
}

function StateC({ overlay, onHold, onDismiss }: { overlay: ResultOverlayState; onHold: () => void; onDismiss: () => void }) {
  const passed = overlay.passed
  const yeas = overlay.yea_count ?? 0
  const nays = overlay.nay_count ?? 0
  const abs = overlay.abstain_count ?? 0
  const remaining = overlay.seconds_remaining ?? 0
  const totalDuration = overlay.total_duration ?? 8
  const progressPct = Math.max(0, Math.min(100, (remaining / totalDuration) * 100))
  const bg = passed ? 'var(--semantic-success-bg)' : 'var(--semantic-danger-bg)'
  const borderColor = passed ? 'var(--semantic-success-border)' : 'var(--semantic-danger-border)'
  const fg = passed ? 'var(--semantic-success-text)' : 'var(--semantic-danger-text)'
  const heading = passed ? 'Motion passes' : 'Motion fails'

  return (
    <div className="cs-card" style={{ background: bg, borderColor }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: fg, letterSpacing: '0.05em', fontWeight: 500 }}>
          Result on overlay
        </div>
        <span style={{ fontSize: 14, fontWeight: 500, color: fg }}>
          {overlay.held ? 'held' : `${remaining}s`}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: fg }}>{heading}</span>
      </div>
      <div style={{ fontSize: 11, color: fg, opacity: 0.8, marginBottom: 8 }}>
        {yeas} yea · {nays} nay · {abs} abs
      </div>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 999, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ width: `${progressPct}%`, height: '100%', background: fg, transition: 'width 1s linear' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <button
          type="button"
          onClick={onHold}
          disabled={overlay.held}
          className="cs-touchbtn"
          style={{ padding: '10px 4px', fontSize: 11, minHeight: 40 }}
        >
          {overlay.held ? 'Held' : 'Hold'}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="cs-touchbtn"
          style={{ padding: '10px 4px', fontSize: 11, minHeight: 40 }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

function truncate(s: string, n: number) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s
}