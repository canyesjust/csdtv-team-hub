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

const COLOR = {
  surface1: 'var(--surface-1, #131b2e)',
  surface2: 'var(--surface-2, #1a2236)',
  textPrimary: 'var(--text-primary, #f8fafc)',
  textMuted: 'var(--text-muted, #6b7385)',
  borderSubtle: 'var(--border-subtle, rgba(255, 255, 255, 0.08))',
  dangerBg: 'rgba(239, 68, 68, 0.12)',
  dangerBorder: 'rgba(239, 68, 68, 0.35)',
  dangerText: '#ef4444',
  successBg: 'rgba(34, 197, 94, 0.12)',
  successBorder: 'rgba(34, 197, 94, 0.35)',
  successText: '#22c55e',
  warningBg: 'rgba(245, 158, 11, 0.12)',
  warningBorder: 'rgba(245, 158, 11, 0.35)',
  warningText: '#f59e0b',
}

export default function MotionAndVoteCard(props: Props) {
  const { lifecycle, resultOverlay, isLive, onOpenMotion, onContinueMotion, onHoldResult, onDismissResult } = props

  if (resultOverlay && resultOverlay.active) {
    return <StateC overlay={resultOverlay} onHold={onHoldResult} onDismiss={onDismissResult} />
  }

  const lifecycleActive = lifecycle
    && lifecycle.state !== 'no_motion'
    && lifecycle.state !== 'closed'
    && lifecycle.active_motion !== null

  if (lifecycleActive) {
    return <StateB lifecycle={lifecycle!} onContinue={onContinueMotion} />
  }

  return <StateA isLive={isLive} onOpen={onOpenMotion} />
}

function cardStyle(borderColor?: string, bg?: string): React.CSSProperties {
  return {
    background: bg || COLOR.surface1,
    border: `0.5px solid ${borderColor || COLOR.borderSubtle}`,
    borderRadius: 12,
    padding: '14px 16px',
  }
}

function StateA({ isLive, onOpen }: { isLive: boolean; onOpen: () => void }) {
  return (
    <div style={cardStyle()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: COLOR.textMuted, letterSpacing: '0.05em' }}>Motion & vote</div>
        <span style={{ fontSize: 10, color: COLOR.textMuted }}>idle</span>
      </div>
      <div style={{ fontSize: 11, color: COLOR.textMuted, marginBottom: 12, minHeight: 28 }}>
        No motion on floor
      </div>
      <button
        type="button"
        onClick={onOpen}
        disabled={!isLive}
        style={{
          width: '100%',
          minHeight: 44,
          padding: '12px 16px',
          borderRadius: 10,
          border: `0.5px solid ${COLOR.borderSubtle}`,
          background: COLOR.surface2,
          color: COLOR.textPrimary,
          fontFamily: 'inherit',
          fontSize: 13,
          fontWeight: 500,
          cursor: isLive ? 'pointer' : 'not-allowed',
          opacity: isLive ? 1 : 0.5,
        }}
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
    : status === 'voted' ? 'VOTED'
    : status.toUpperCase()
  const motion = lifecycle.active_motion!
  const isSubstitute = motion.motion_type === 'substitute'
  const text = motion.text || '(no text yet)'
  const moverName = motion.mover_name || '—'
  const seconderName = motion.seconder_name || '—'
  const voteCount = lifecycle.recorded_votes_count || 0

  return (
    <div style={cardStyle(COLOR.warningBorder)}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: COLOR.warningText, letterSpacing: '0.05em', fontWeight: 500 }}>
          {isSubstitute ? 'Substitute motion' : 'Motion in progress'}
        </div>
        <span style={{
          fontSize: 10, padding: '2px 6px', borderRadius: 999,
          background: COLOR.warningBg,
          color: COLOR.warningText,
          fontWeight: 500,
        }}>{statusLabel}</span>
      </div>
      <div style={{ fontSize: 11, marginBottom: 4, lineHeight: 1.35, color: COLOR.textPrimary }}>
        {truncate(text, 80)}
      </div>
      <div style={{ fontSize: 10, color: COLOR.textMuted, marginBottom: 10 }}>
        {moverName} / {seconderName}
        {status === 'voting' ? ` · ${voteCount} votes recorded` : ''}
        {isSubstitute ? ' · main held' : ''}
      </div>
      <button
        type="button"
        onClick={onContinue}
        style={{
          width: '100%',
          minHeight: 44,
          padding: '12px 16px',
          borderRadius: 10,
          border: `0.5px solid ${COLOR.warningBorder}`,
          background: COLOR.warningBg,
          color: COLOR.warningText,
          fontFamily: 'inherit',
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
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
  const bg = passed ? COLOR.successBg : COLOR.dangerBg
  const borderColor = passed ? COLOR.successBorder : COLOR.dangerBorder
  const fg = passed ? COLOR.successText : COLOR.dangerText
  const heading = passed ? 'Motion passes' : 'Motion fails'

  return (
    <div style={cardStyle(borderColor, bg)}>
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
          style={smallBtn(!overlay.held)}
        >
          {overlay.held ? 'Held' : 'Hold'}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          style={smallBtn(true)}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

function smallBtn(enabled: boolean): React.CSSProperties {
  return {
    minHeight: 36,
    padding: '8px 14px',
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

function truncate(s: string, n: number) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s
}
