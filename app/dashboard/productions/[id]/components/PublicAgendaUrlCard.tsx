'use client'

import { useEffect, useState } from 'react'
import { toast } from '@/lib/toast'

export default function PublicAgendaUrlCard({
  productionId,
  initialUrl,
  onSaved,
}: {
  productionId: string
  initialUrl?: string | null
  onSaved?: (url: string | null) => void
}) {
  const [url, setUrl] = useState(initialUrl?.trim() || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setUrl(initialUrl?.trim() || '')
  }, [initialUrl])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/board-meetings/${productionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_agenda_url: url.trim() || null }),
      })
      const body = await res.json()
      if (!res.ok) {
        toast(body.error || 'Could not save agenda URL', 'error')
        return
      }
      const saved = body.board_meeting?.public_agenda_url?.trim() || null
      onSaved?.(saved)
      toast('Public agenda URL saved', 'success')
    } finally {
      setSaving(false)
    }
  }

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'

  return (
    <div
      style={{
        marginBottom: '16px',
        padding: '14px 16px',
        background: cardBg,
        border: `0.5px solid ${border}`,
        borderRadius: '10px',
      }}
    >
      <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600, color: text }}>Public agenda link</p>
      <p style={{ margin: '0 0 10px', fontSize: '13px', color: muted, lineHeight: 1.45 }}>
        Set once per meeting. The &ldquo;View meeting agenda&rdquo; QR preset on the control surface uses this URL.
      </p>
      <input
        type="url"
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="https://…"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          minHeight: '44px',
          padding: '10px 12px',
          borderRadius: '8px',
          border: `0.5px solid ${border}`,
          background: 'var(--surface-2)',
          color: text,
          fontFamily: 'inherit',
          fontSize: '14px',
          marginBottom: '8px',
        }}
      />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        style={{
          fontSize: '13px',
          padding: '8px 14px',
          minHeight: '40px',
          borderRadius: '8px',
          background: 'var(--brand-primary)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontWeight: 600,
        }}
      >
        {saving ? 'Saving…' : 'Save agenda URL'}
      </button>
    </div>
  )
}
