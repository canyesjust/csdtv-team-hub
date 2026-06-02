'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  BUILTIN_QR_PRESET_KEYS,
  templateUsesAgendaUrl,
  type QrPresetRow,
} from '@/lib/board-meetings/qr-presets'

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
  productionId: string
  publicAgendaUrl?: string | null
  activeQR?: ActiveQR | null
  hasCurrentDocument?: boolean
  hasYoutube?: boolean
  onPush: (payload: PushPayload) => void
  onExtend?: (additionalSeconds: number) => void
  onDismiss: () => void
}

function presetAvailability(
  preset: QrPresetRow,
  opts: { hasCurrentDocument: boolean; hasYoutube: boolean; publicAgendaUrl: string | null },
): { available: boolean; hint?: string } {
  const agenda = opts.publicAgendaUrl?.trim() || ''

  switch (preset.key) {
    case 'document_current_item':
      return opts.hasCurrentDocument
        ? { available: true }
        : { available: false, hint: 'No document on the current agenda item' }
    case 'youtube_live':
      return opts.hasYoutube
        ? { available: true }
        : { available: false, hint: 'No livestream URL on this production' }
    case 'agenda':
      return agenda
        ? { available: true }
        : {
            available: false,
            hint: 'Set the public agenda URL on the Board Meeting tab',
          }
    case 'archive':
    case 'submit_comment':
      return { available: true }
    default:
      if (!preset.url_template) {
        return { available: false, hint: 'No URL template configured' }
      }
      if (templateUsesAgendaUrl(preset.url_template) && !agenda) {
        return {
          available: false,
          hint: 'Needs a public agenda URL on the Board Meeting tab',
        }
      }
      return { available: true }
  }
}

export default function QRPushPanel({
  canControl,
  productionId,
  publicAgendaUrl,
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
          productionId={productionId}
          publicAgendaUrl={publicAgendaUrl}
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
  productionId,
  publicAgendaUrl,
  hasCurrentDocument,
  hasYoutube,
  onPush,
  onClose,
}: {
  productionId: string
  publicAgendaUrl?: string | null
  hasCurrentDocument: boolean
  hasYoutube: boolean
  onPush: (payload: PushPayload) => void
  onClose: () => void
}) {
  const [presets, setPresets] = useState<QrPresetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [customUrl, setCustomUrl] = useState('')
  const [customLabel, setCustomLabel] = useState('')

  useEffect(() => {
    let cancelled = false
    void fetch('/api/qr-presets')
      .then(res => res.json())
      .then(body => {
        if (cancelled) return
        setPresets(body.presets || [])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const opts = {
    hasCurrentDocument,
    hasYoutube,
    publicAgendaUrl: publicAgendaUrl ?? null,
  }

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

        {!publicAgendaUrl?.trim() ? (
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--semantic-warning-text)', lineHeight: 1.45 }}>
            Add a{' '}
            <Link
              href={`/dashboard/productions/${productionId}?tab=boardmeeting`}
              style={{ color: 'inherit', fontWeight: 600 }}
            >
              public agenda URL
            </Link>{' '}
            on the Board Meeting tab to enable the agenda QR preset.
          </p>
        ) : (
          <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
            Agenda: {publicAgendaUrl.trim()}
          </p>
        )}

        <div className="cs-modal-section">
          <label className="cs-modal-label">From library</label>
          {loading ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Loading presets…</p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                maxHeight: 'min(50vh, 360px)',
                overflowY: 'auto',
              }}
            >
              {presets.map(p => {
                const { available, hint } = presetAvailability(p, opts)
                const desc =
                  p.description ||
                  (p.key === 'agenda'
                    ? 'Public agenda link for this meeting'
                    : BUILTIN_QR_PRESET_KEYS.has(p.key)
                      ? 'Built-in preset'
                      : p.url_template || '')
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!available}
                    title={available ? desc : hint}
                    onClick={() => onPush({ preset_key: p.key })}
                    style={{
                      padding: '12px',
                      borderRadius: 10,
                      border: '0.5px solid var(--border-subtle)',
                      background: 'var(--surface-2)',
                      color: 'var(--text-primary)',
                      fontFamily: 'inherit',
                      cursor: available ? 'pointer' : 'not-allowed',
                      opacity: available ? 1 : 0.45,
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                      minHeight: 60,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{p.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {available ? desc : hint}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
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
