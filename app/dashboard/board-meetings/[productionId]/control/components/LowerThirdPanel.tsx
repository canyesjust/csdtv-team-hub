'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from '@/lib/toast'
import type { LowerThirdPerson } from '@/lib/board-meetings/types'

type BroadcastState = {
  active_lower_third_person_id?: string | null
} | null

export default function LowerThirdPanel({
  productionId,
  broadcastState,
  disabled,
  onUpdated,
}: {
  productionId: string
  broadcastState: BroadcastState
  disabled: boolean
  onUpdated: () => void
}) {
  const [people, setPeople] = useState<LowerThirdPerson[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const activeId = broadcastState?.active_lower_third_person_id ?? null

  const loadPeople = useCallback(async () => {
    const res = await fetch('/api/lower-third-people')
    const body = await res.json()
    if (res.ok) {
      setPeople((body.people || []).filter((p: LowerThirdPerson) => p.is_active))
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadPeople() }, [loadPeople])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return people
    return people.filter(p => {
      const hay = `${p.display_name} ${p.primary_title || ''} ${p.affiliation || ''} ${p.officer_position || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [people, search])

  const activePerson = activeId ? people.find(p => p.id === activeId) : null

  const post = async (path: string, body?: Record<string, unknown>) => {
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
      toast('Lower third updated', 'success')
      onUpdated()
    } finally {
      setBusy(false)
    }
  }

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
    opacity: disabled || busy ? 0.5 : 1,
    textAlign: 'left',
    width: '100%',
  }

  return (
    <div>
      {activePerson ? (
        <p style={{ margin: '0 0 10px', fontSize: '13px', color: 'var(--text-muted)' }}>
          On air: <strong style={{ color: 'var(--text-primary)' }}>{activePerson.display_name}</strong>
        </p>
      ) : (
        <p style={{ margin: '0 0 10px', fontSize: '13px', color: 'var(--text-muted)' }}>No lower third selected</p>
      )}

      <input
        type="search"
        placeholder="Search people…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        disabled={disabled || busy}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          marginBottom: '10px',
          padding: '10px 12px',
          minHeight: '44px',
          borderRadius: '8px',
          border: '0.5px solid var(--border-subtle)',
          fontFamily: 'inherit',
          fontSize: '14px',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto', marginBottom: '10px' }}>
        {loading && <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Loading…</p>}
        {!loading && filtered.length === 0 && (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>No matches. Add people in Board Meetings → People.</p>
        )}
        {filtered.map(p => (
          <button
            key={p.id}
            type="button"
            disabled={disabled || busy}
            onClick={() => post('set-lower-third', { person_id: p.id })}
            style={{
              ...btn,
              border: p.id === activeId ? '2px solid var(--brand-primary)' : btn.border,
              background: p.id === activeId ? 'rgba(30,108,181,0.1)' : btn.background,
            }}
          >
            <span style={{ fontWeight: 600 }}>{p.display_name}</span>
            {(p.primary_title || p.officer_position) && (
              <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {[p.primary_title, p.officer_position].filter(Boolean).join(' · ')}
              </span>
            )}
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={disabled || busy || !activeId}
        onClick={() => post('clear-lower-third')}
        style={{ ...btn, width: 'auto', textAlign: 'center' }}
      >
        Clear lower third
      </button>
    </div>
  )
}
