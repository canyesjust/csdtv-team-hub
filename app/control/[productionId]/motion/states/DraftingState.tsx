'use client'

export default function DraftingState({
  currentTitle,
  isConsentLead,
  consentRange,
  disabled,
  busy,
  onOpenMain,
  onOpenConsent,
}: {
  currentTitle: string | null
  isConsentLead: boolean
  consentRange: string | null
  disabled?: boolean
  busy?: boolean
  onOpenMain: () => void
  onOpenConsent: () => void
}) {
  return (
    <div className="cs-card">
      <p className="cs-eyebrow">Open a motion</p>
      {currentTitle ? (
        <p style={{ margin: '0 0 12px', fontSize: 15, color: 'var(--text-primary)' }}>{currentTitle}</p>
      ) : (
        <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-muted)' }}>
          Advance to an action item on the control surface first.
        </p>
      )}
      <button type="button" className="cs-touchbtn cs-touchbtn-primary" disabled={disabled || busy || !currentTitle} onClick={onOpenMain}>
        Open main motion
      </button>
      {isConsentLead && consentRange ? (
        <button
          type="button"
          className="cs-touchbtn"
          style={{ marginTop: 8, width: '100%' }}
          disabled={disabled || busy}
          onClick={onOpenConsent}
        >
          Open consent motion ({consentRange})
        </button>
      ) : null}
    </div>
  )
}
