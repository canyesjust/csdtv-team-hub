'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import Loader from '../../../components/Loader'
import { toast } from '@/lib/toast'
import type { AgendaItemUI, BoardMeetingRecord } from '@/lib/board-meetings/types'
import type { AgendaDiffEntry } from '@/lib/board-meetings/agenda-diff'

type Phase = 'loading' | 'empty' | 'extracting' | 'review' | 'locked' | 'diff' | 'readonly'

export default function BoardMeetingTab({ productionId }: { productionId: string }) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const [phase, setPhase] = useState<Phase>('loading')
  const [meeting, setMeeting] = useState<BoardMeetingRecord | null>(null)
  const [items, setItems] = useState<AgendaItemUI[]>([])
  const [error, setError] = useState('')
  const [locking, setLocking] = useState(false)
  const [diff, setDiff] = useState<AgendaDiffEntry[]>([])
  const [diffAccepted, setDiffAccepted] = useState<Record<string, boolean>>({})
  const [isNarrow, setIsNarrow] = useState(false)

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'
  const inputBg = 'var(--surface-2)'

  const inputStyle: React.CSSProperties = {
    background: inputBg,
    border: `0.5px solid ${border}`,
    borderRadius: '8px',
    padding: '8px 10px',
    fontSize: '13px',
    color: text,
    fontFamily: 'inherit',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    minHeight: '40px',
  }

  useEffect(() => {
    const check = () => setIsNarrow(typeof window !== 'undefined' && window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const load = useCallback(async () => {
    setError('')
    const res = await fetch(`/api/board-meetings/${productionId}`)
    const body = await res.json()
    if (!res.ok) {
      setError(body.error || 'Failed to load')
      setPhase('empty')
      return
    }
    setMeeting(body.board_meeting)
    const loaded: AgendaItemUI[] = (body.items || []).map((it: AgendaItemUI & { presenters?: { name: string; title?: string | null }[] }) => ({
      ...it,
      presenters: (it.presenters || []).map(p => ({ name: p.name, title: p.title })),
    }))
    setItems(loaded)
    if (body.board_meeting?.agenda_locked) setPhase('locked')
    else if (loaded.length > 0) setPhase('review')
    else setPhase('empty')
  }, [productionId])

  useEffect(() => { load() }, [load])

  const sortedReviewItems = useMemo(() => {
    const copy = [...items]
    copy.sort((a, b) => {
      if (a.needs_review !== b.needs_review) return a.needs_review ? -1 : 1
      return a.sort_order - b.sort_order
    })
    return copy
  }, [items])

  const uploadPdf = async (file: File, reupload = false) => {
    if (file.type && file.type !== 'application/pdf') {
      setError('Please select a PDF file')
      return
    }
    setError('')
    setPhase('extracting')
    const fd = new FormData()
    fd.append('pdf', file)
    const url = reupload
      ? `/api/board-meetings/${productionId}/re-upload-agenda`
      : `/api/board-meetings/${productionId}/upload-agenda`
    try {
      const res = await fetch(url, { method: 'POST', body: fd })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error || 'Extraction failed')
        setPhase(reupload ? 'locked' : 'empty')
        return
      }
      if (reupload && body.diff) {
        setDiff(body.diff)
        const acc: Record<string, boolean> = {}
        for (const d of body.diff as AgendaDiffEntry[]) acc[d.change_id] = true
        setDiffAccepted(acc)
        setPhase('diff')
        return
      }
      toast('Agenda extracted — review items below', 'success')
      await load()
      setPhase('review')
    } catch {
      setError('Extraction failed. Try again or upload a different PDF.')
      setPhase(reupload ? 'locked' : 'empty')
    }
  }

  const updateItem = (idx: number, patch: Partial<AgendaItemUI>) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  const saveItemPatch = async (item: AgendaItemUI) => {
    if (!item.id || meeting?.agenda_locked) return
    await fetch(`/api/board-meetings/${productionId}/agenda-items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    })
  }

  const lockAgenda = async () => {
    setLocking(true)
    const res = await fetch(`/api/board-meetings/${productionId}/lock-agenda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
    const body = await res.json()
    setLocking(false)
    if (!res.ok) {
      toast(body.error || 'Lock failed', 'error')
      return
    }
    toast('Agenda locked', 'success')
    load()
  }

  const applyDiff = async () => {
    const changes = diff
      .filter(d => diffAccepted[d.change_id])
      .map(d => {
        if (d.kind === 'added') return { change_id: d.change_id, kind: 'added', after: d.after }
        if (d.kind === 'removed') return { change_id: d.change_id, kind: 'removed', before_id: d.before.id }
        return { change_id: d.change_id, kind: 'modified', before_id: d.before.id, after: d.after }
      })
    const res = await fetch(`/api/board-meetings/${productionId}/apply-diff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes }),
    })
    const body = await res.json()
    if (!res.ok) {
      toast(body.error || 'Apply failed', 'error')
      return
    }
    toast('Changes applied', 'success')
    load()
  }

  if (phase === 'loading') return <Loader />

  if (isNarrow && phase !== 'locked' && phase !== 'readonly') {
    return (
      <div style={{ padding: '24px', textAlign: 'center', background: cardBg, borderRadius: '12px', border: `0.5px solid ${border}`, color: muted }}>
        Open on desktop or iPad to edit the board meeting agenda.
        {meeting?.agenda_locked && items.length > 0 && (
          <div style={{ marginTop: '16px', textAlign: 'left', color: text }}>
            <p style={{ fontWeight: 600, marginBottom: '8px' }}>Locked agenda ({items.length} items)</p>
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px' }}>
              {items.slice(0, 8).map(it => (
                <li key={it.id || it.item_number}>{it.item_number} {it.title}</li>
              ))}
              {items.length > 8 && <li>…and {items.length - 8} more</li>}
            </ul>
          </div>
        )}
      </div>
    )
  }

  const fileInput = (reupload: boolean) => (
    <label style={{ display: 'inline-block', cursor: 'pointer' }}>
      <input
        type="file"
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) uploadPdf(f, reupload)
          e.target.value = ''
        }}
      />
      <span style={{
        display: 'inline-block',
        fontSize: '14px',
        padding: '10px 18px',
        borderRadius: '10px',
        background: '#1e6cb5',
        color: '#fff',
        fontWeight: 500,
        minHeight: '44px',
        lineHeight: '24px',
      }}>
        {reupload ? 'Re-upload amended agenda' : 'Upload agenda PDF'}
      </span>
    </label>
  )

  return (
    <div>
      {error && (
        <div style={{ padding: '12px 14px', marginBottom: '12px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {phase === 'empty' && (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: cardBg, borderRadius: '12px', border: `0.5px solid ${border}` }}>
          <p style={{ color: muted, marginBottom: '16px' }}>Upload a BoardDocs agenda PDF to extract structured agenda items.</p>
          {fileInput(false)}
        </div>
      )}

      {phase === 'extracting' && (
        <div style={{ textAlign: 'center', padding: '48px', color: muted }}>Extracting agenda…</div>
      )}

      {phase === 'review' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <p style={{ margin: 0, color: muted, fontSize: '14px' }}>Review extracted items. Items needing review appear first.</p>
            <button
              type="button"
              onClick={lockAgenda}
              disabled={locking || items.length === 0}
              style={{ fontSize: '14px', padding: '10px 20px', minHeight: '44px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
            >
              {locking ? 'Locking…' : 'Lock agenda'}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {sortedReviewItems.map((it, idx) => {
              const realIdx = items.findIndex(x => x === it || (x.item_number === it.item_number && x.section_number === it.section_number))
              return (
                <div
                  key={it.id || `${it.item_number}-${idx}`}
                  style={{
                    padding: '14px',
                    background: it.needs_review ? (dark ? 'rgba(232,160,32,0.08)' : '#fff8eb') : cardBg,
                    border: `0.5px solid ${it.needs_review ? 'rgba(232,160,32,0.35)' : border}`,
                    borderRadius: '10px',
                  }}
                >
                  <div style={{ fontSize: '12px', color: muted, marginBottom: '6px' }}>
                    §{it.section_number} {it.section_title} · {it.item_number}
                    {it.needs_review && <span style={{ color: '#e8a020', marginLeft: '8px' }}>Needs review</span>}
                  </div>
                  <input
                    value={it.title}
                    onChange={e => updateItem(realIdx >= 0 ? realIdx : idx, { title: e.target.value })}
                    onBlur={() => saveItemPatch(it)}
                    style={{ ...inputStyle, marginBottom: '8px', fontWeight: 600 }}
                  />
                  {it.review_notes && <p style={{ fontSize: '12px', color: '#e8a020', margin: '0 0 8px' }}>{it.review_notes}</p>}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
                    <select value={it.type} onChange={e => updateItem(realIdx >= 0 ? realIdx : idx, { type: e.target.value })} style={inputStyle}>
                      <option value="procedural">Procedural</option>
                      <option value="information">Information</option>
                      <option value="action">Action</option>
                      <option value="recognition">Recognition</option>
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: muted, minHeight: '44px' }}>
                      <input type="checkbox" checked={it.is_broadcastable} onChange={e => updateItem(realIdx >= 0 ? realIdx : idx, { is_broadcastable: e.target.checked })} />
                      Broadcastable
                    </label>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {phase === 'locked' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div>
              <p style={{ margin: 0, fontWeight: 600, color: text }}>Agenda locked</p>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: muted }}>
                Status: {meeting?.broadcast_status || 'prepared'} · {items.length} items
              </p>
            </div>
            {fileInput(true)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {items.map(it => (
              <div key={it.id} style={{ padding: '12px 14px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '8px' }}>
                <span style={{ fontSize: '12px', color: muted }}>{it.item_number}</span>
                <span style={{ fontSize: '14px', color: text, fontWeight: 500, marginLeft: '8px' }}>{it.title}</span>
                {!it.is_broadcastable && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#e8a020' }}>Not broadcastable</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {phase === 'diff' && (
        <div>
          <p style={{ color: muted, marginBottom: '12px' }}>Review changes from amended PDF. Uncheck any change to skip.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {diff.map(d => (
              <label
                key={d.change_id}
                style={{
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'flex-start',
                  padding: '12px',
                  background: cardBg,
                  border: `0.5px solid ${border}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  minHeight: '44px',
                }}
              >
                <input
                  type="checkbox"
                  checked={!!diffAccepted[d.change_id]}
                  onChange={e => setDiffAccepted(a => ({ ...a, [d.change_id]: e.target.checked }))}
                  style={{ marginTop: '4px', width: '16px', height: '16px' }}
                />
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', color: d.kind === 'added' ? '#22c55e' : d.kind === 'removed' ? '#ef4444' : '#e8a020' }}>{d.kind}</div>
                  {d.kind === 'removed' && <div style={{ fontSize: '14px', color: text }}>{d.before.item_number} {d.before.title}</div>}
                  {d.kind === 'added' && <div style={{ fontSize: '14px', color: text }}>{d.after.item_number} {d.after.title}</div>}
                  {d.kind === 'modified' && (
                    <div style={{ fontSize: '14px', color: text }}>
                      {d.before.item_number}: <span style={{ textDecoration: 'line-through', color: muted }}>{d.before.title}</span>
                      {' → '}
                      <span>{d.after.title}</span>
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={applyDiff}
            style={{ fontSize: '14px', padding: '10px 20px', minHeight: '44px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
          >
            Apply changes
          </button>
        </div>
      )}
    </div>
  )
}
