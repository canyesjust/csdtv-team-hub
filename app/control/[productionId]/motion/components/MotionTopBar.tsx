'use client'

type Props = {
  onMinimize: () => void
  liveElapsed: string | null
}

export default function MotionTopBar({ onMinimize, liveElapsed }: Props) {
  return (
    <div className="ms-topbar">
      <button
        type="button"
        onClick={onMinimize}
        style={{
          fontSize: 12,
          padding: '6px 12px',
          background: 'transparent',
          border: '0.5px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
          borderRadius: 8,
          color: 'var(--text-primary, #f8fafc)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          minHeight: 36,
          fontFamily: 'inherit',
        }}
      >
        ← Minimize
        <span style={{ fontSize: 10, color: 'var(--text-muted, #6b7385)', marginLeft: 2 }}>
          · motion stays active
        </span>
      </button>
      {liveElapsed && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 999,
          background: 'var(--semantic-danger-bg)',
          color: 'var(--semantic-danger-text)',
          fontSize: 11, fontWeight: 500,
        }}>
          <span className="cs-pulse-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor' }} />
          LIVE · {liveElapsed}
        </span>
      )}
    </div>
  )
}
