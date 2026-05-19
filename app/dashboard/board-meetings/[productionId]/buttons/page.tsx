'use client'

import { use, useCallback, useState } from 'react'
import Link from 'next/link'
import { toast } from '@/lib/toast'

const ACTIONS = [
  { label: 'Advance', path: 'advance' },
  { label: 'Back', path: 'go-back' },
  { label: 'Toggle overlay', path: 'toggle-overlay' },
  { label: 'Recess', path: 'recess', body: { message: 'Recess' } },
  { label: 'Tech difficulties', path: 'technical-difficulties' },
  { label: 'Clear mode', path: 'clear-mode' },
  { label: 'Go live', path: 'go-live' },
  { label: 'End meeting', path: 'end-meeting', danger: true },
] as const

export default function CompanionButtonsPage({ params }: { params: Promise<{ productionId: string }> }) {
  const { productionId } = use(params)
  const [busy, setBusy] = useState(false)
  const text = 'var(--text-primary)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'

  const fire = useCallback(async (path: string, body?: Record<string, unknown>) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/board-meetings/${productionId}/control/${path}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json()
      if (!res.ok) toast(data.error || 'Failed', 'error')
    } finally {
      setBusy(false)
    }
  }, [productionId])

  return (
    <div style={{ padding: '20px', maxWidth: '640px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <Link href={`/control/${productionId}`} style={{ color: 'var(--brand-primary)', fontSize: '14px' }}>
          ← Control surface
        </Link>
        <h1 style={{ margin: '12px 0 0', fontSize: '22px', color: text }}>Companion buttons</h1>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: '12px',
        }}
      >
        {ACTIONS.map(a => (
          <button
            key={a.path}
            type="button"
            disabled={busy}
            onClick={() => fire(a.path, 'body' in a ? a.body : undefined)}
            style={{
              minHeight: '72px',
              padding: '16px',
              borderRadius: '12px',
              border: `0.5px solid ${border}`,
              background: 'danger' in a && a.danger ? '#8b1a1a' : cardBg,
              color: 'danger' in a && a.danger ? '#fff' : text,
              fontSize: '15px',
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}
