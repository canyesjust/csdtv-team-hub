'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/lib/toast'
import { getActiveQrRemainingSeconds, isQrActive, type QrStateFields } from '@/lib/board-meetings/qr-control'

type BroadcastState = Partial<QrStateFields>

type Props = {
  productionId: string
  broadcastState: BroadcastState | null
  currentDocuments: { source_url: string | null }[]
  hasYoutube: boolean
  disabled: boolean
  onUpdated: () => void
}

export default function QRPushPanel({
  productionId,
  broadcastState,
  currentDocuments,
  hasYoutube,
  disabled,
  onUpdated,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const [customOpen, setCustomOpen] = useState(false)
  const [customUrl, setCustomUrl] = useState('')
  const [customLabel, setCustomLabel] = useState('')

  const qrFields: QrStateFields | null = broadcastState
    ? {
        active_qr_url: broadcastState.active_qr_url ?? null,
        active_qr_label: broadcastState.active_qr_label ?? null,
        active_qr_started_at: broadcastState.active_qr_started_at ?? null,
        active_qr_duration_seconds: broadcastState.active_qr_duration_seconds ?? null,
      }
    : null

  const qrActive = qrFields ? isQrActive(qrFields) : false

  useEffect(() => {
    if (!qrFields || !qrActive) {
      setRemaining(0)
      return
    }
    const tick = () => setRemaining(getActiveQrRemainingSeconds(qrFields))
    tick()
    const t = setInterval(tick, 500)
    return () => clearInterval(t)
  }, [qrFields, qrActive])

  const post = useCallback(async (path: string, body?: Record<string, unknown>) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/board-meetings/${productionId}/control/${path}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error || 'Failed', 'error')
        return
      }
      onUpdated()
    } finally {
      setBusy(false)
    }
  }, [productionId, onUpdated])

  const hasDoc = currentDocuments.some(d => d.source_url)
  const btn: React.CSSProperties = {
    fontSize: '13px',
    padding: '10px 12px',
    minHeight: '44px',
    borderRadius: '8px',
    border: '0.5px solid var(--border-subtle)',
    background: 'var(--surface-2)',
    color: 'var(--text-primary)',
    cursor: disabled || busy ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    fontWeight: 600,
    opacity: disabled || busy ? 0.5 : 1,
  }

  if (qrActive) {
    return (
      <div style={{ padding: '14px', background: 'var(--surface-1)', border: '0.5px solid var(--border-subtle)', borderRadius: '10px' }}>
        <p style={{ margin: '0 0 10px', fontWeight: 600, fontSize: '14px' }}>QR active — {remaining}s remaining</p>
        <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--text-muted)' }}>{broadcastState?.active_qr_label}</p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" style={btn} disabled={busy} onClick={() => post('extend-qr', { additional_seconds: 12 })}>Extend +12s</button>
          <button type="button" style={btn} disabled={busy} onClick={() => post('dismiss-qr')}>Dismiss</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '14px', background: 'var(--surface-1)', border: '0.5px solid var(--border-subtle)', borderRadius: '10px' }}>
      <p style={{ margin: '0 0 10px', fontWeight: 600, fontSize: '14px' }}>Push QR</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        <button type="button" style={btn} disabled={disabled || busy || !hasDoc} onClick={() => post('push-qr', { preset_key: 'document_current_item' })}>
          Current item document
        </button>
        <button type="button" style={btn} disabled={disabled || busy || !hasYoutube} onClick={() => post('push-qr', { preset_key: 'youtube_live' })}>
          Watch live (YouTube)
        </button>
        <button type="button" style={btn} disabled={disabled || busy} onClick={() => post('push-qr', { preset_key: 'archive' })}>
          View archive
        </button>
        <button type="button" style={btn} disabled={disabled || busy} onClick={() => post('push-qr', { preset_key: 'submit_comment' })}>
          Submit public comment
        </button>
        <button type="button" style={btn} disabled={disabled || busy} onClick={() => setCustomOpen(true)}>
          Custom URL
        </button>
      </div>
      {customOpen && (
        <div style={{ marginTop: '12px', padding: '12px', border: '0.5px solid var(--border-subtle)', borderRadius: '8px' }}>
          <input
            value={customUrl}
            onChange={e => setCustomUrl(e.target.value)}
            placeholder="https://..."
            style={{ width: '100%', marginBottom: '8px', padding: '10px', borderRadius: '8px', border: '0.5px solid var(--border-subtle)', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
          <input
            value={customLabel}
            onChange={e => setCustomLabel(e.target.value)}
            placeholder="Label (optional)"
            style={{ width: '100%', marginBottom: '8px', padding: '10px', borderRadius: '8px', border: '0.5px solid var(--border-subtle)', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              style={btn}
              disabled={busy || !customUrl.trim()}
              onClick={() => {
                post('push-qr', { custom_url: customUrl.trim(), custom_label: customLabel.trim() || undefined })
                setCustomOpen(false)
                setCustomUrl('')
                setCustomLabel('')
              }}
            >
              Push
            </button>
            <button type="button" style={btn} onClick={() => setCustomOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
