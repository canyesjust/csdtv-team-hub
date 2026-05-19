'use client'

type Props = {
  canControl: boolean
  isLive: boolean
  agendaOverlayOn: boolean
  busy?: boolean
  onBack: () => void
  onAdvance: () => void
  onToggleOverlay: () => void
  onGoLive: () => void
}

export default function TransportCard({
  canControl,
  isLive,
  agendaOverlayOn,
  busy,
  onBack,
  onAdvance,
  onToggleOverlay,
  onGoLive,
}: Props) {
  const disabled = !canControl || busy

  return (
    <div className="cs-card">
      <div className="cs-eyebrow" style={{ marginBottom: 8 }}>Transport</div>
      <div className="control-btn-row" style={{ marginBottom: 8 }}>
        <button type="button" className="cs-touchbtn" disabled={disabled} onClick={onBack}>← Back</button>
        <button type="button" className="cs-touchbtn cs-touchbtn-primary" disabled={disabled} onClick={onAdvance}>Advance →</button>
        <button type="button" className="cs-touchbtn" disabled={disabled} onClick={onToggleOverlay}>
          Overlay {agendaOverlayOn ? 'on' : 'off'}
        </button>
      </div>
      {!isLive && (
        <button type="button" className="cs-touchbtn cs-touchbtn-primary" disabled={disabled} onClick={onGoLive} style={{ width: '100%', minHeight: 44 }}>
          Go live
        </button>
      )}
    </div>
  )
}
