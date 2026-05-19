'use client'

type Props = {
  liveElapsed: string | null
  onMinimize: () => void
}

export default function MotionTopBar({ liveElapsed, onMinimize }: Props) {
  return (
    <header className="ms-topbar">
      <div>
        <h1 className="ms-topbar__title">Motion &amp; vote</h1>
        {liveElapsed && (
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Live {liveElapsed}
          </p>
        )}
      </div>
      <div className="ms-topbar__actions">
        <button type="button" className="cs-touchbtn" onClick={onMinimize}>
          Minimize
        </button>
      </div>
    </header>
  )
}
