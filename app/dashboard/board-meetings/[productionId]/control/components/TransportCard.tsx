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
    <div className="cs-card cs-transport">
      <div className="cs-transport-row">
        <div className="cs-transport-nav">
          <button type="button" className="cs-touchbtn cs-touchbtn-small" disabled={disabled} onClick={onBack}>
            ← Back
          </button>
          <button
            type="button"
            className="cs-touchbtn cs-touchbtn-small cs-touchbtn-primary"
            disabled={disabled}
            onClick={onAdvance}
          >
            Advance →
          </button>
          <button type="button" className="cs-touchbtn cs-touchbtn-small" disabled={disabled} onClick={onToggleOverlay}>
            Overlay {agendaOverlayOn ? 'on' : 'off'}
          </button>
        </div>

        <div className="cs-transport-clock" aria-label="Meeting elapsed">
          <span className="cs-transport-elapsed">{elapsedLabel ?? '—:—'}</span>
          <div className="cs-transport-clock-actions">
            {!elapsedStartedAt ? (
              <button type="button" className="cs-touchbtn cs-touchbtn-small" disabled={disabled} onClick={onStartElapsed}>
                Start clock
              </button>
            ) : (
              <>
                <button type="button" className="cs-touchbtn cs-touchbtn-small" disabled={disabled} onClick={onResetElapsed}>
                  Reset
                </button>
                <button type="button" className="cs-touchbtn cs-touchbtn-small" disabled={disabled} onClick={onClearElapsed}>
                  Stop
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
