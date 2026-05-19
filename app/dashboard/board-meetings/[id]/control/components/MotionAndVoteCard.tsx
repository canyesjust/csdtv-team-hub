'use client'

type ActiveMotion = {
  id: string
  motion_type: 'main' | 'substitute' | 'amendment'
  text: string | null
  mover_name: string | null
  seconder_name: string | null
}

type MotionLifecycleState = {
  state: 'no_motion' | 'drafting' | 'open_for_discussion' | 'voting' | 'voted' | 'closed'
  active_motion: ActiveMotion | null
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

type Props = {
  lifecycle: MotionLifecycleState | null
  resultOverlay: ResultOverlayState | null
  isLive: boolean
  onOpenMotion: () => void
  onContinueMotion: () => void
  onHoldResult: () => void
  onDismissResult: () => void
}

export default function MotionAndVoteCard(props: Props) {
  const { lifecycle, resultOverlay, isLive, onOpenMotion, onContinueMotion, onHoldResult, onDismissResult } = props

  if (resultOverlay && resultOverlay.active) {
    return <StateC overlay={resultOverlay} onHold={onHoldResult} onDismiss={onDismissResult} />
  }

  const lifecycleActive = lifecycle
    && lifecycle.state !== 'no_motion'
    && lifecycle.state !== 'closed'
    && lifecycle.state !== 'voted'
    && lifecycle.active_motion !== null

  if (lifecycleActive) {
    return <StateB lifecycle={lifecycle!} onContinue={onContinueMotion} />
  }

  return <StateA isLive={isLive} onOpen={onOpenMotion} />
}

function StateA({ isLive, onOpen }: { isLive: boolean; onOpen: () => void }) {
  return (
    <div className="cs-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div className="cs-eyebrow" style={{ marginBottom: 0 }}>Motion & vote</div>
        <span style={{ fontSize: 10, color: 'var(--text-muted, #6b7385)' }}>idle</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted, #6b7385)', marginBottom: 12, minHeight: 28 }}>
        No motion on floor
      </div>
      <button
        type="button"
        onClick={onOpen}
        disabled={!isLive}
        className="cs-touchbtn"
        style={{ width: '100%' }}
      >
        Open motion screen →
      </button>
    </div>
  )
}

function StateB({ lifecycle, onContinue }: { lifecycle: MotionLifecycleState; onContinue: () => void }) {
  const status = lifecycle.state
  const statusLabel = status === 'drafting' ? 'DRAFTING'
    : status === 'open_for_discussion' ? 'DISCUSSION'
    : status === 'voting' ? 'VOTING'
    : status.toUpperCase()
  const motion = lifecycle.active_motion!
  const isSubstitute = motion.motion_type === 'substitute'
  const text = motion.text || '(no text yet)'
  const moverName = motion.mover_name || '—'
  const seconderName = motion.seconder_name || '—'
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
      <div style={{ fontSize: 11, marginBottom: 4, lineHeight: 1.35, color: 'var(--text-primary, #f8fafc)' }}>
        {truncate(text, 80)}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted, #6b7385)', marginBottom: 10 }}>
        {moverName} / {seconderName}
        {status === 'voting' ? ` · ${voteCount} votes recorded` : ''}
        {isSubstitute ? ' · main held' : ''}
      </div>
      <button
        type="button"
        onClick={onContinue}
        className="cs-touchbtn"
        style={{
          width: '100%',
          background: 'var(--semantic-warning-bg)',
          color: 'var(--semantic-warning-text)',
          borderColor: 'var(--semantic-warning-border)',
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
      <div style={{ fontSize: 13, fontWeight: 500, color: fg, marginBottom: 4 }}>
        {heading}
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
          className="cs-touchbtn cs-touchbtn-small"
        >
          {overlay.held ? 'Held' : 'Hold'}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="cs-touchbtn cs-touchbtn-small"
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
