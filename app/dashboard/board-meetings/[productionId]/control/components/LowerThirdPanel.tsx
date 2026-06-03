'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from '@/lib/toast'
import {
  BOARD_LOWER_THIRD_ORDER,
  boardMembersInOrder,
  lowerThirdFirstName,
} from '@/lib/board-meetings/lower-third-board-order'
import type { LowerThirdPosition } from '@/lib/board-meetings/lower-third-control'
import { LOWER_THIRD_POSITIONS } from '@/lib/board-meetings/lower-third-control'
import type { LowerThirdPerson } from '@/lib/board-meetings/types'

type LowerThirdStateFields = {
  active_lower_third_person_id?: string | null
}

type BroadcastState = Partial<LowerThirdStateFields> | null

type CallbackProps = {
  active: { person_id: string; display_name: string; primary_title: string | null } | null
  /** Fallback when live sync has not hydrated full person details yet. */
  activePersonId?: string | null
  people: LowerThirdPerson[]
  position: LowerThirdPosition
  canControl: boolean
  onSet: (person: LowerThirdPerson) => void
  onPositionChange: (position: LowerThirdPosition) => void
  onClear: () => void
}

type LegacyProps = {
  productionId: string
  broadcastState: BroadcastState
  disabled: boolean
  onUpdated: () => void
}

export default function LowerThirdPanel(props: CallbackProps | LegacyProps) {
  if ('onSet' in props) {
    return <LowerThirdPanelControlled {...props} />
  }
  return <LowerThirdPanelLegacy {...props} />
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const POSITION_LABELS: Record<LowerThirdPosition, string> = {
  left: 'Left',
  center: 'Center',
  right: 'Right',
}

function LowerThirdPanelControlled({
  active,
  activePersonId = null,
  people,
  position,
  canControl,
  onSet,
  onPositionChange,
  onClear,
}: CallbackProps) {
  const activeId = active?.person_id ?? activePersonId ?? null
  const disabled = !canControl
  const prioritySlots = useMemo(() => boardMembersInOrder(people), [people])
  const priorityIds = useMemo(
    () => new Set(prioritySlots.filter((p): p is LowerThirdPerson => p != null).map(p => p.id)),
    [prioritySlots],
  )

  const [otherOpen, setOtherOpen] = useState(false)

  const handleOtherSelect = (person: LowerThirdPerson) => {
    onSet(person)
    setOtherOpen(false)
  }

  const handleClear = () => {
    onClear()
    setOtherOpen(false)
  }

  return (
    <div className="cs-card cs-lt">
      <div className="cs-lt-header">
        <div className="cs-lt-title-row">
          <span className="cs-lt-label">Lower third</span>
          <div className="cs-lt-pos-toggle" role="group" aria-label="Lower third position">
            {LOWER_THIRD_POSITIONS.map(pos => (
              <button
                key={pos}
                type="button"
                className={`cs-lt-pos-btn${position === pos ? ' cs-lt-pos-btn--active' : ''}`}
                disabled={disabled}
                aria-pressed={position === pos}
                onClick={() => onPositionChange(pos)}
              >
                {POSITION_LABELS[pos]}
              </button>
            ))}
          </div>
        </div>
        {active ? (
          <span className="cs-lt-onair-pill">
            <span className="cs-lt-onair-dot" aria-hidden="true" />
            <span>On air:</span>
            <strong>
              {active.display_name}
              {active.primary_title ? ` · ${active.primary_title}` : ''}
            </strong>
          </span>
        ) : (
          <span className="cs-lt-onair-empty">No lower third selected</span>
        )}
        <button
          type="button"
          className="cs-lt-clear-btn"
          disabled={disabled || !activeId}
          onClick={handleClear}
        >
          Clear
        </button>
      </div>

      <div className="cs-lt-grid">
        {prioritySlots.map((person, i) => {
          const slotName = BOARD_LOWER_THIRD_ORDER[i]
          if (!person) {
            return (
              <button
                key={slotName}
                type="button"
                className="cs-lt-btn cs-lt-btn--missing"
                disabled
                title="Not found in People library — add this person via the People settings"
              >
                {capitalize(slotName)}
              </button>
            )
          }
          const isActive = person.id === activeId
          return (
            <button
              key={person.id}
              type="button"
              className={`cs-lt-btn${isActive ? ' cs-lt-btn--active' : ''}`}
              disabled={disabled}
              onClick={() => onSet(person)}
            >
              {capitalize(lowerThirdFirstName(person.display_name) || person.display_name)}
            </button>
          )
        })}
        <button
          type="button"
          className="cs-lt-btn cs-lt-btn--other"
          disabled={disabled}
          onClick={() => setOtherOpen(true)}
        >
          <span className="cs-lt-other-icon" aria-hidden="true" />
          Other
        </button>
      </div>

      {otherOpen ? (
        <OtherPersonModal
          excludeIds={priorityIds}
          activeId={activeId}
          onSelect={handleOtherSelect}
          onClear={handleClear}
          onClose={() => setOtherOpen(false)}
        />
      ) : null}
    </div>
  )
}

function OtherPersonModal({
  excludeIds,
  activeId,
  onSelect,
  onClear,
  onClose,
}: {
  excludeIds: Set<string>
  activeId: string | null
  onSelect: (person: LowerThirdPerson) => void
  onClear: () => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<LowerThirdPerson[]>([])
  const [loading, setLoading] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customTitle, setCustomTitle] = useState('')
  const [creating, setCreating] = useState(false)

  const runSearch = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const url = q.trim()
        ? `/api/lower-third-people?search=${encodeURIComponent(q.trim())}`
        : '/api/lower-third-people'
      const res = await fetch(url)
      const body = await res.json()
      if (res.ok) {
        const rows: LowerThirdPerson[] = (body.people || []).filter(
          (p: LowerThirdPerson) => p.is_active && !excludeIds.has(p.id),
        )
        setResults(rows)
      }
    } finally {
      setLoading(false)
    }
  }, [excludeIds])

  useEffect(() => {
    runSearch('')
  }, [runSearch])

  useEffect(() => {
    const handle = setTimeout(() => runSearch(search), 200)
    return () => clearTimeout(handle)
  }, [search, runSearch])

  const handleCustom = async () => {
    if (!customName.trim()) {
      toast('Name is required', 'error')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/lower-third-people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: customName.trim(),
          primary_title: customTitle.trim() || null,
          category: 'other',
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        toast(body.error || 'Failed to add person', 'error')
        return
      }
      const person = body.person as LowerThirdPerson | undefined
      if (!person?.id) {
        toast('Person created but no id returned', 'error')
        return
      }
      onSelect(person)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="cs-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="cs-modal-dialog"
        role="dialog"
        aria-labelledby="cs-lt-other-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="cs-modal-header">
          <h3 id="cs-lt-other-title" className="cs-modal-title">Lower third — Other</h3>
          <button type="button" className="cs-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="cs-modal-section">
          <label className="cs-modal-label" htmlFor="cs-lt-search">Search people library</label>
          <input
            id="cs-lt-search"
            type="search"
            className="cs-modal-input"
            placeholder="Type a name or title…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          <div className="cs-modal-results">
            {loading ? (
              <p className="cs-modal-results-empty">Loading…</p>
            ) : results.length === 0 ? (
              <p className="cs-modal-results-empty">
                {search.trim() ? 'No matches.' : 'No other people in the library.'}
              </p>
            ) : (
              results.map(p => {
                const isActive = p.id === activeId
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`cs-modal-result${isActive ? ' cs-modal-result--active' : ''}`}
                    onClick={() => (isActive ? onClear() : onSelect(p))}
                  >
                    <span className="cs-modal-result-name">{p.display_name}</span>
                    {(p.primary_title || p.officer_position) ? (
                      <span className="cs-modal-result-sub">
                        {[p.primary_title, p.officer_position].filter(Boolean).join(' · ')}
                      </span>
                    ) : null}
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div className="cs-modal-divider" />

        <div className="cs-modal-section">
          <label className="cs-modal-label">Or use a one-time custom name</label>
          <input
            type="text"
            className="cs-modal-input"
            placeholder="Display name (required)"
            value={customName}
            onChange={e => setCustomName(e.target.value)}
          />
          <input
            type="text"
            className="cs-modal-input"
            placeholder="Title (optional)"
            value={customTitle}
            onChange={e => setCustomTitle(e.target.value)}
          />
          <div className="cs-modal-actions">
            <button
              type="button"
              className="cs-touchbtn cs-touchbtn-primary"
              disabled={!customName.trim() || creating}
              onClick={handleCustom}
            >
              {creating ? 'Adding…' : 'Use this name'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function LowerThirdPanelLegacy({
  productionId,
  broadcastState,
  disabled,
  onUpdated,
}: LegacyProps) {
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
                <button
                  key={person.id}
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => selectPerson(person.id)}
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
          <button
            key={p.id}
            type="button"
            disabled={disabled || busy}
            onClick={() => selectPerson(p.id)}
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

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="cs-touchbtn"
          disabled={disabled || busy || !activeId}
          onClick={() => post('clear-lower-third')}
          style={{ minWidth: 160 }}
        >
          Clear lower third
        </button>
      </div>
    </div>
  )
}