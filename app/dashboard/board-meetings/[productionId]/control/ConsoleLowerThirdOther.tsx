'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/lib/toast'
import type { LowerThirdPerson } from '@/lib/board-meetings/types'

const C = {
  panel2: '#16223a',
  line: 'rgba(255,255,255,.08)',
  line2: 'rgba(255,255,255,.14)',
  text: '#eaf1fb',
  soft: '#9fb2d0',
  dim: '#64748b',
  accent: '#4f9dee',
  accentbg: 'rgba(79,157,238,.16)',
}

/**
 * Console lower-third "Other" picker: search the full people library OR add a
 * one-time custom name/title, for speakers who aren't board members or frequent
 * staff (presenters, public commenters, guests). Dark-themed to match the console.
 */
export default function ConsoleLowerThirdOther({
  excludeIds,
  activeId,
  canControl,
  onPick,
}: {
  excludeIds: Set<string>
  activeId: string | null
  canControl: boolean
  onPick: (p: LowerThirdPerson) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<LowerThirdPerson[]>([])
  const [loading, setLoading] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customTitle, setCustomTitle] = useState('')
  const [creating, setCreating] = useState(false)

  const runSearch = useCallback(
    async (q: string) => {
      setLoading(true)
      try {
        const url = q.trim()
          ? `/api/lower-third-people?search=${encodeURIComponent(q.trim())}`
          : '/api/lower-third-people'
        const res = await fetch(url)
        const body = await res.json()
        if (res.ok) {
          setResults(
            (body.people || []).filter((p: LowerThirdPerson) => p.is_active && !excludeIds.has(p.id)),
          )
        }
      } finally {
        setLoading(false)
      }
    },
    [excludeIds],
  )

  useEffect(() => {
    if (!open) return
    const h = setTimeout(() => runSearch(search), 200)
    return () => clearTimeout(h)
  }, [search, open, runSearch])

  const pick = (p: LowerThirdPerson) => {
    onPick(p)
    setOpen(false)
    setSearch('')
  }

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
      setCustomName('')
      setCustomTitle('')
      pick(person)
    } finally {
      setCreating(false)
    }
  }

  const input: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    background: C.panel2,
    border: `1px solid ${C.line}`,
    borderRadius: 8,
    color: C.text,
    fontSize: 13,
    padding: '8px 10px',
    fontFamily: 'inherit',
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={!canControl}
        onClick={() => setOpen(true)}
        style={{
          font: 'inherit', fontSize: 12, padding: '7px 11px', borderRadius: 999, cursor: 'pointer',
          marginTop: 8, border: `1px dashed ${C.line2}`, background: 'transparent', color: C.soft,
        }}
      >
        + Other / search people…
      </button>
    )
  }

  return (
    <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: C.panel2, border: `1px solid ${C.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: C.dim, fontWeight: 600 }}>Other speaker</span>
        <button type="button" onClick={() => setOpen(false)} style={{ font: 'inherit', fontSize: 16, lineHeight: 1, border: 'none', background: 'transparent', color: C.soft, cursor: 'pointer' }}>×</button>
      </div>

      <input
        type="search"
        placeholder="Search the people library…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        autoFocus
        style={input}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto', marginTop: 8 }}>
        {loading ? (
          <p style={{ fontSize: 12, color: C.dim, margin: '4px 0' }}>Loading…</p>
        ) : results.length === 0 ? (
          <p style={{ fontSize: 12, color: C.dim, margin: '4px 0' }}>{search.trim() ? 'No matches.' : 'No other people in the library.'}</p>
        ) : (
          results.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p)}
              style={{
                font: 'inherit', textAlign: 'left', padding: '7px 9px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${p.id === activeId ? C.accent : C.line}`,
                background: p.id === activeId ? C.accentbg : 'transparent', color: C.text,
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 13 }}>{p.display_name}</span>
              {(p.primary_title || p.officer_position) && (
                <span style={{ display: 'block', fontSize: 11, color: C.soft, marginTop: 1 }}>
                  {[p.primary_title, p.officer_position].filter(Boolean).join(' · ')}
                </span>
              )}
            </button>
          ))
        )}
      </div>

      <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 10, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: C.dim, fontWeight: 600 }}>Or a one-time custom name</span>
        <input type="text" placeholder="Display name (required)" value={customName} onChange={e => setCustomName(e.target.value)} style={input} />
        <input type="text" placeholder="Title (optional)" value={customTitle} onChange={e => setCustomTitle(e.target.value)} style={input} />
        <button
          type="button"
          disabled={!customName.trim() || creating}
          onClick={handleCustom}
          style={{
            font: 'inherit', fontSize: 13, fontWeight: 600, padding: '8px 12px', borderRadius: 8, border: 'none', alignSelf: 'flex-end',
            background: customName.trim() ? C.accent : C.line, color: customName.trim() ? '#06101f' : C.soft,
            cursor: customName.trim() ? 'pointer' : 'default',
          }}
        >
          {creating ? 'Adding…' : 'Use this name'}
        </button>
      </div>
    </div>
  )
}
