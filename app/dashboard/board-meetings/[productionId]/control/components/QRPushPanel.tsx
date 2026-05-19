'use client'

import { useEffect, useState } from 'react'

type ActiveQR = {
  url: string
  label: string | null
  startedAt: string | null
  durationSeconds: number | null
}

type PushPayload = {
  preset_key?: string
  custom_url?: string
  custom_label?: string
}

type Props = {
  canControl: boolean
  activeQR?: ActiveQR | null
  hasCurrentDocument?: boolean
  hasYoutube?: boolean
  onPush: (payload: PushPayload) => void
  onExtend?: (additionalSeconds: number) => void
  onDismiss: () => void
}

type Template = {
  key: string
  label: string
  description: string
  available: boolean
  unavailableHint?: string
}

export default function QRPushPanel({
  canControl,
  activeQR,
  hasCurrentDocument,
  hasYoutube,
  onPush,
  onExtend,
  onDismiss,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const [remaining, setRemaining] = useState<number>(0)

  const qrIsActive = !!(activeQR?.url)

  useEffect(() => {
    if (!qrIsActive || !activeQR?.startedAt || !activeQR?.durationSeconds) {
      setRemaining(0)
      return
    }
    const startedMs = new Date(activeQR.startedAt).getTime()
    const totalMs = activeQR.durationSeconds * 1000
    const tick = () => {
      const elapsed = Date.now() - startedMs
      setRemaining(Math.max(0, Math.ceil((totalMs - elapsed) / 1000)))
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [qrIsActive, activeQR?.startedAt, activeQR?.durationSeconds])

  if (qrIsActive && activeQR) {
    return (
      <div className="cs-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span className="cs-eyebrow" style={{ margin: 0 }}>QR ON OVERLAY</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 999,
              background: 'var(--semantic-success-bg)',
              color: 'var(--semantic-success-text)',
            }}
          >
            {remaining > 0 ? `${remaining}s` : 'expired'}
          </span>
        </div>
        {activeQR.label ? (
          <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 500 }}>{activeQR.label}</p>
        ) : null}
        <p
          style={{
            margin: '0 0 12px',
            fontSize: 11,
            color: 'var(--text-muted)',
            wordBreak: 'break-all',
          }}
        >
          {activeQR.url}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {onExtend ? (
            <button
              type="button"
              className="cs-touchbtn cs-touchbtn-small"
              style={{ flex: 1 }}
              disabled={!canControl}
              onClick={() => onExtend(12)}
            >
              Extend +12s
            </button>
          ) : null}
          <button
            type="button"
            className="cs-touchbtn cs-touchbtn-small"
            style={{ flex: 1 }}
            disabled={!canControl}
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="cs-card">
        <div className="cs-eyebrow" style={{ marginBottom: 8 }}>QR PUSH</div>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-muted)' }}>
          No QR active
        </p>
        <button
          type="button"
          className="cs-touchbtn cs-touchbtn-primary"
          style={{ width: '100%' }}
          disabled={!canControl}
          onClick={() => setModalOpen(true)}
        >
          Push QR to overlay
        </button>
      </div>

      {modalOpen ? (
        <PushQRModal
          hasCurrentDocument={!!hasCurrentDocument}
          hasYoutube={!!hasYoutube}
          onPush={(payload) => {
            onPush(payload)
            setModalOpen(false)
          }}
          onClose={() => setModalOpen(false)}
        />
      ) : null}
    </>
  )
}

function PushQRModal({
  hasCurrentDocument,
  hasYoutube,
  onPush,
  onClose,
}: {
  hasCurrentDocument: boolean
  hasYoutube: boolean
  onPush: (payload: PushPayload) => void
  onClose: () => void
}) {
  const [customUrl, setCustomUrl] = useState('')
  const [customLabel, setCustomLabel] = useState('')

  const templates: Template[] = [
    {
      key: 'document_current_item',
      label: 'Current item document',
      description: 'Pushes the document attached to the current agenda item',
      available: hasCurrentDocument,
      unavailableHint: 'No document on the current agenda item',
    },
    {
      key: 'youtube_live',
      label: 'Watch live (YouTube)',
      description: 'Pushes the YouTube livestream URL',
      available: hasYoutube,
      unavailableHint: 'No livestream URL set on this production',
    },
    {
      key: 'archive',
      label: 'View archive',
      description: 'Pushes the meeting archive URL',
      available: true,
    },
    {
      key: 'submit_comment',
      label: 'Submit public comment',
      description: 'Pushes the public comment form URL',
      available: true,
    },
  ]

  const handlePushCustom = () => {
    if (!customUrl.trim()) return
    onPush({
      custom_url: customUrl.trim(),
      custom_label: customLabel.trim() || undefined,
    })
  }

  return (
    <div className="cs-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="cs-modal-dialog"
        role="dialog"
        aria-labelledby="cs-qr-modal-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="cs-modal-header">
          <h3 id="cs-qr-modal-title" className="cs-modal-title">Push QR to overlay</h3>
          <button type="button" className="cs-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="cs-modal-section">
          <label className="cs-modal-label">Quick push</label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
            }}
          >
            {templates.map(t => (
              <button
                key={t.key}
                type="button"
                disabled={!t.available}
                title={t.available ? t.description : t.unavailableHint}
                onClick={() => onPush({ preset_key: t.key })}
                style={{
                  padding: '12px',
                  borderRadius: 10,
                  border: '0.5px solid var(--border-subtle)',
                  background: 'var(--surface-2)',
                  color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                  cursor: t.available ? 'pointer' : 'not-allowed',
                  opacity: t.available ? 1 : 0.45,
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  minHeight: 60,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>{t.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {t.available ? t.description : t.unavailableHint}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="cs-modal-divider" />

        <div className="cs-modal-section">
          <label className="cs-modal-label" htmlFor="cs-qr-custom-url">Or use a custom URL</label>
          <input
            id="cs-qr-custom-url"
            type="url"
            className="cs-modal-input"
            placeholder="https://…"
            value={customUrl}
            onChange={e => setCustomUrl(e.target.value)}
          />
          <input
            type="text"
            className="cs-modal-input"
            placeholder="Label (optional)"
            value={customLabel}
            onChange={e => setCustomLabel(e.target.value)}
          />
          <div className="cs-modal-actions">
            <button
              type="button"
              className="cs-touchbtn cs-touchbtn-primary"
              disabled={!customUrl.trim()}
              onClick={handlePushCustom}
            >
              Push custom URL
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}