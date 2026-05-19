'use client'

import { formatElapsed } from '@/lib/board-meetings/time-format'

type Props = {
  canControl: boolean
  agendaOverlayOn: boolean
  busy?: boolean
  elapsedStartedAt?: string | null
  clockNowMs?: number
  onBack: () => void
  onAdvance: () => void
  onToggleOverlay: () => void
  onStartElapsed: () => void
  onResetElapsed: () => void
  onClearElapsed: () => void
}

export default function TransportCard({
  canControl,
  agendaOverlayOn,
  busy,
  elapsedStartedAt,
  clockNowMs = Date.now(),
  onBack,
  onAdvance,
  onToggleOverlay,
  onStartElapsed,
  onResetElapsed,
  onClearElapsed,
}: Props) {
  const disabled = !canControl || busy
  const elapsedLabel = elapsedStartedAt
    ? formatElapsed(clockNowMs - new Date(elapsedStartedAt).getTime())
    : null

  return (
    <div className="cs-card">
      <div className="cs-eyebrow" style={{ marginBottom: 8 }}>
        Transport
      </div>
      <div className="cs-eyebrow" style={{ marginBottom: 6, marginTop: 10 }}>
        Meeting elapsed
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontFamily: 'ui-monospace, monospace',
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '0.02em',
            minWidth: '4.5ch',
          }}
        >
          {elapsedLabel ?? '—:—'}
        </span>
        {!elapsedStartedAt ? (
          <button type="button" className="cs-touchbtn" disabled={disabled} onClick={onStartElapsed}>
            Start clock
          </button>
        ) : (
          <>
            <button type="button" className="cs-touchbtn" disabled={disabled} onClick={onResetElapsed}>
              Reset
            </button>
            <button type="button" className="cs-touchbtn" disabled={disabled} onClick={onClearElapsed}>
              Stop
            </button>
          </>
        )}
      </div>
      <div className="control-btn-row" style={{ marginBottom: 8 }}>
        <button type="button" className="cs-touchbtn" disabled={disabled} onClick={onBack}>
          ← Back
        </button>
        <button type="button" className="cs-touchbtn cs-touchbtn-primary" disabled={disabled} onClick={onAdvance}>
          Advance →
        </button>
        <button type="button" className="cs-touchbtn" disabled={disabled} onClick={onToggleOverlay}>
          Overlay {agendaOverlayOn ? 'on' : 'off'}
        </button>
      </div>
    </div>
  )
}
