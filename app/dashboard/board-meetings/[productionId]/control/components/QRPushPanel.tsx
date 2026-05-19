'use client'

import { useState } from 'react'

type Props = {
  canControl: boolean
  activeQR?: string | null
  onPush: (url: string, label?: string) => void
  onClear: () => void
}

export default function QRPushPanel({ canControl, activeQR, onPush, onClear }: Props) {
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')

  if (activeQR) {
    return (
      <div className="cs-card">
        <div className="cs-eyebrow" style={{ marginBottom: 6 }}>QR on overlay</div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 10px', wordBreak: 'break-all' }}>{activeQR}</p>
        <button type="button" className="cs-touchbtn" style={{ width: '100%' }} onClick={onClear}>
          Clear QR
        </button>
      </div>
    )
  }

  return (
    <div className="cs-card">
      <div className="cs-eyebrow" style={{ marginBottom: 8 }}>QR push</div>
      <input
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="https://..."
        disabled={!canControl}
        style={{ width: '100%', marginBottom: 6, padding: 8, borderRadius: 8, border: '0.5px solid var(--border-subtle)', boxSizing: 'border-box', fontSize: 12 }}
      />
      <input
        value={label}
        onChange={e => setLabel(e.target.value)}
        placeholder="Label"
        disabled={!canControl}
        style={{ width: '100%', marginBottom: 8, padding: 8, borderRadius: 8, border: '0.5px solid var(--border-subtle)', boxSizing: 'border-box', fontSize: 12 }}
      />
      <button
        type="button"
        className="cs-touchbtn"
        style={{ width: '100%', minHeight: 44 }}
        disabled={!canControl || !url.trim()}
        onClick={() => {
          onPush(url.trim(), label.trim() || undefined)
          setUrl('')
          setLabel('')
        }}
      >
        Push QR
      </button>
    </div>
  )
}
