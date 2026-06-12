'use client'

import { useEffect, useState } from 'react'
import { getActiveQrRemainingSeconds, isQrActive } from '@/lib/board-meetings/qr-control'
import { templateUsesAgendaUrl, type QrPresetRow } from '@/lib/board-meetings/qr-presets'

type ActiveQR = { url: string; label: string | null; startedAt: string | null; durationSeconds: number | null }
type PushPayload = { preset_key?: string; custom_url?: string; custom_label?: string }

type Props = {
  canControl: boolean
  publicAgendaUrl?: string | null
  activeQR?: ActiveQR | null
  hasCurrentDocument?: boolean
  hasYoutube?: boolean
  onPush: (payload: PushPayload) => void
  onExtend?: (seconds: number) => void
  onDismiss: () => void
}

const C = {
  panel2: '#16223a', line: 'rgba(255,255,255,.08)', line2: 'rgba(255,255,255,.14)',
  text: '#eaf1fb', soft: '#9fb2d0', dim: '#64748b', accent: '#4f9dee', yea: '#34d399', yeabg: 'rgba(52,211,153,.16)',
}

function presetAvailable(p: QrPresetRow, o: { hasCurrentDocument: boolean; hasYoutube: boolean; agenda: string }): boolean {
  switch (p.key) {
    case 'document_current_item': return o.hasCurrentDocument
    case 'youtube_live': return o.hasYoutube
    case 'agenda': return !!o.agenda
    case 'archive': case 'submit_comment': return true
    default:
      if (!p.url_template) return false
      if (templateUsesAgendaUrl(p.url_template) && !o.agenda) return false
      return true
  }
}

export default function ConsoleQR({ canControl, publicAgendaUrl, activeQR, hasCurrentDocument, hasYoutube, onPush, onExtend, onDismiss }: Props) {
  const [open, setOpen] = useState(false)
  const [presets, setPresets] = useState<QrPresetRow[]>([])
  const [customUrl, setCustomUrl] = useState('')
  const [, setTick] = useState(0)

  const qrFields = activeQR?.url
    ? { active_qr_url: activeQR.url, active_qr_label: activeQR.label, active_qr_started_at: activeQR.startedAt, active_qr_duration_seconds: activeQR.durationSeconds }
    : null
  const live = qrFields ? isQrActive(qrFields) : false
  const remaining = qrFields && live ? getActiveQrRemainingSeconds(qrFields) : 0

  // Re-render every 500ms while a QR is live so the countdown ticks.
  useEffect(() => {
    if (!activeQR?.url) return
    const id = setInterval(() => setTick(t => t + 1), 500)
    return () => clearInterval(id)
  }, [activeQR?.url, activeQR?.startedAt, activeQR?.durationSeconds])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void fetch('/api/qr-presets').then(r => r.json()).then(b => { if (!cancelled) setPresets(b.presets || []) })
    return () => { cancelled = true }
  }, [open])

  const agenda = publicAgendaUrl?.trim() || ''
  const btn: React.CSSProperties = { font: 'inherit', fontSize: 12, padding: '7px 11px', borderRadius: 8, border: `1px solid ${C.line2}`, background: 'transparent', color: C.text, cursor: 'pointer' }

  if (live && activeQR) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: C.text }}>{activeQR.label || 'QR on overlay'}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.yea, background: C.yeabg, padding: '2px 8px', borderRadius: 999 }}>{remaining > 0 ? `${remaining}s` : 'expired'}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {onExtend && <button style={{ ...btn, flex: 1 }} disabled={!canControl} onClick={() => onExtend(12)}>+12s</button>}
          <button style={{ ...btn, flex: 1 }} disabled={!canControl} onClick={onDismiss}>Dismiss</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <button style={{ ...btn, width: '100%', background: C.accent, color: '#06101f', border: 'none', fontWeight: 600, padding: 10 }} disabled={!canControl} onClick={() => setOpen(true)}>Push QR to overlay</button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(2,5,11,.6)', zIndex: 50 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 460, maxWidth: '92vw', maxHeight: '82vh', overflow: 'auto', background: '#0c1220', border: `1px solid ${C.line2}`, borderRadius: 14, padding: 18, zIndex: 51, color: C.text }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>Push QR to overlay</span>
              <button style={btn} onClick={() => setOpen(false)}>Close</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {presets.map(p => {
                const ok = presetAvailable(p, { hasCurrentDocument: !!hasCurrentDocument, hasYoutube: !!hasYoutube, agenda })
                return (
                  <button key={p.id} disabled={!ok} onClick={() => { onPush({ preset_key: p.key }); setOpen(false) }}
                    style={{ ...btn, textAlign: 'left', background: C.panel2, opacity: ok ? 1 : 0.4, cursor: ok ? 'pointer' : 'not-allowed', padding: 11 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.label}</div>
                    <div style={{ fontSize: 11, color: C.soft }}>{ok ? (p.description || '') : 'unavailable'}</div>
                  </button>
                )
              })}
            </div>
            <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 14, paddingTop: 14 }}>
              <div style={{ fontSize: 12, color: C.soft, marginBottom: 6 }}>Or a custom URL</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={customUrl} onChange={e => setCustomUrl(e.target.value)} placeholder="https://…"
                  style={{ flex: 1, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 8, color: C.text, font: 'inherit', fontSize: 13, padding: '8px 10px' }} />
                <button style={{ ...btn, background: C.accent, color: '#06101f', border: 'none', fontWeight: 600 }} disabled={!customUrl.trim()} onClick={() => { onPush({ custom_url: customUrl.trim() }); setOpen(false) }}>Push</button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
