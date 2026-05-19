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
<<<<<<< HEAD
          border: '0.5px solid var(--border-subtle)',
          borderRadius: 8,
          color: 'var(--text-primary)',
=======
          border: '0.5px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
          borderRadius: 8,
          color: 'var(--text-primary, #f8fafc)',
>>>>>>> 33c0c41 (Control surface and motion screen redesign)
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          minHeight: 36,
<<<<<<< HEAD
        }}
      >
        ← Minimize
        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 2 }}>
=======
          fontFamily: 'inherit',
        }}
      >
        ← Minimize
        <span style={{ fontSize: 10, color: 'var(--text-muted, #6b7385)', marginLeft: 2 }}>
>>>>>>> 33c0c41 (Control surface and motion screen redesign)
          · motion stays active
        </span>
      </button>
      {liveElapsed && (
<<<<<<< HEAD
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 999,
            background: 'var(--semantic-danger-bg)',
            color: 'var(--semantic-danger-text)',
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          <span
            className="cs-pulse-dot"
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--semantic-danger-text)',
            }}
          />
=======
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 999,
          background: 'var(--semantic-danger-bg)',
          color: 'var(--semantic-danger-text)',
          fontSize: 11, fontWeight: 500,
        }}>
          <span className="cs-pulse-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor' }} />
>>>>>>> 33c0c41 (Control surface and motion screen redesign)
          LIVE · {liveElapsed}
        </span>
      )}
    </div>
  )
}
