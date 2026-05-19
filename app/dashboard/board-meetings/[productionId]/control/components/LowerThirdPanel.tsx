'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from '@/lib/toast'
import {
  BOARD_LOWER_THIRD_ORDER,
  boardMembersInOrder,
} from '@/lib/board-meetings/lower-third-board-order'
import type { LowerThirdPerson } from '@/lib/board-meetings/types'

type LowerThirdStateFields = {
  active_lower_third_person_id?: string | null
}

type BroadcastState = Partial<LowerThirdStateFields> | null

function PersonButton({
  person,
  activeId,
  disabled,
  busy,
  onSelect,
  btn,
}: {
  person: LowerThirdPerson
  activeId: string | null
  disabled: boolean
  busy: boolean
  onSelect: (id: string) => void
  btn: React.CSSProperties
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={() => onSelect(person.id)}
      style={{
        ...btn,
        border: person.id === activeId ? '2px solid var(--brand-primary)' : btn.border,
        background: person.id === activeId ? 'rgba(30,108,181,0.1)' : btn.background,
      }}
    >
      <span style={{ fontWeight: 600 }}>{person.display_name}</span>
      {(person.primary_title || person.officer_position) && (
        <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
          {[person.primary_title, person.officer_position].filter(Boolean).join(' · ')}
        </span>
      )}
    </button>
  )
}

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

  const boardMembers = useMemo(() => boardMembersInOrder(people), [people])
  const boardMemberIds = useMemo(
    () => new Set(boardMembers.filter((p): p is LowerThirdPerson => p != null).map(p => p.id)),
    [boardMembers],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const others = people.filter(p => !boardMemberIds.has(p.id))
    if (!q) return others
    return others.filter(p => {
      const hay = `${p.display_name} ${p.primary_title || ''} ${p.affiliation || ''} ${p.officer_position || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [people, search, boardMemberIds])

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

  const selectPerson = (personId: string) => post('set-lower-third', { person_id: personId })

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

  const labelStyle: React.CSSProperties = {
    margin: '0 0 8px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
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

      <p style={labelStyle}>Board members</p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: '6px',
          marginBottom: '14px',
        }}
      >
        {loading
          ? BOARD_LOWER_THIRD_ORDER.map(name => (
              <div
                key={name}
                style={{ ...btn, opacity: 0.4, cursor: 'default', textTransform: 'capitalize' }}
                aria-hidden
              >
                {name}
              </div>
            ))
          : boardMembers.map((person, i) => {
              const slotName = BOARD_LOWER_THIRD_ORDER[i]
              if (!person) {
                return (
                  <div
                    key={slotName}
                    style={{
                      ...btn,
                      opacity: 0.45,
                      cursor: 'not-allowed',
                      textTransform: 'capitalize',
                    }}
                    title="Not found in People library"
                  >
                    {slotName}
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Not in library
                    </span>
                  </div>
                )
              }
              return (
                <PersonButton
                  key={person.id}
                  person={person}
                  activeId={activeId}
                  disabled={disabled}
                  busy={busy}
                  onSelect={selectPerson}
                  btn={btn}
                />
              )
            })}
      </div>

      <p style={labelStyle}>Everyone else</p>
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto', marginBottom: '10px' }}>
        {loading && <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Loading…</p>}
        {!loading && filtered.length === 0 && (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            {search.trim() ? 'No matches.' : 'No other people in the library.'}
          </p>
        )}
        {filtered.map(p => (
          <PersonButton
            key={p.id}
            person={p}
            activeId={activeId}
            disabled={disabled}
            busy={busy}
            onSelect={selectPerson}
            btn={btn}
          />
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
