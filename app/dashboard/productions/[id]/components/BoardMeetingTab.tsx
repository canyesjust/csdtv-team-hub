'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import GenerateChaptersButton from '@/app/dashboard/board-meetings/[productionId]/components/GenerateChaptersButton'
import { useTheme } from '@/lib/theme'
import Loader from '../../../components/Loader'
import { toast } from '@/lib/toast'
import type { AgendaItemUI, BoardMeetingRecord } from '@/lib/board-meetings/types'
import type { AgendaDiffEntry } from '@/lib/board-meetings/agenda-diff'
import MeetingPlaylistSection from './MeetingPlaylistSection'
import PublicAgendaUrlCard from './PublicAgendaUrlCard'

type Phase = 'loading' | 'empty' | 'extracting' | 'review' | 'locked' | 'diff' | 'readonly'

export default function BoardMeetingTab({ productionId }: { productionId: string }) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const [phase, setPhase] = useState<Phase>('loading')
  const [meeting, setMeeting] = useState<BoardMeetingRecord | null>(null)
  const [productionNumber, setProductionNumber] = useState<number | null>(null)
  const [items, setItems] = useState<AgendaItemUI[]>([])
  const [error, setError] = useState('')
  const [locking, setLocking] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [diff, setDiff] = useState<AgendaDiffEntry[]>([])
  const [diffAccepted, setDiffAccepted] = useState<Record<string, boolean>>({})
  const [isNarrow, setIsNarrow] = useState(false)
  const [reorderingId, setReorderingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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
    setProductionNumber(body.production?.production_number ?? null)
    const loaded: AgendaItemUI[] = (body.items || []).map((it: AgendaItemUI & { presenters?: { name: string; title?: string | null }[] }) => ({
      ...it,
      presenters: (it.presenters || []).map(p => ({ name: p.name, title: p.title })),
    }))
    setItems(loaded)
    if (body.board_meeting?.broadcast_status === 'archived') setPhase('readonly')
    else if (body.board_meeting?.agenda_locked) setPhase('locked')
    else if (loaded.length > 0) setPhase('review')
    else setPhase('empty')
  }, [productionId])

  useEffect(() => { load() }, [load])

  const orderedReviewItems = useMemo(() => {
    return [...items].sort((a, b) => a.sort_order - b.sort_order)
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

  const updateItemById = (id: string | undefined, patch: Partial<AgendaItemUI>) => {
    if (!id) return
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)))
  }

  const persistReorder = async (ordered: AgendaItemUI[]) => {
    const orderedIds = ordered.map(it => it.id).filter((id): id is string => !!id)
    if (orderedIds.length !== ordered.length) return false
    const res = await fetch(`/api/board-meetings/${productionId}/agenda-items/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordered_ids: orderedIds }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast((body as { error?: string }).error || 'Failed to reorder items', 'error')
      return false
    }
    return true
  }

  const moveItem = async (itemId: string, direction: 'up' | 'down') => {
    const ordered = [...items].sort((a, b) => a.sort_order - b.sort_order)
    const idx = ordered.findIndex(it => it.id === itemId)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= ordered.length) return

    const next = [...ordered]
    ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
    const renumbered = next.map((it, i) => ({ ...it, sort_order: i }))
    setItems(renumbered)
    setReorderingId(itemId)
    const ok = await persistReorder(renumbered)
    setReorderingId(null)
    if (!ok) load()
  }

  const deleteItem = async (itemId: string) => {
    if (!confirm('Remove this agenda item from the extracted agenda?')) return
    setDeletingId(itemId)
    const res = await fetch(`/api/board-meetings/${productionId}/agenda-items/${itemId}`, {
      method: 'DELETE',
    })
    setDeletingId(null)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast((body as { error?: string }).error || 'Failed to remove item', 'error')
      return
    }
    toast('Item removed', 'success')
    await load()
  }

  const saveItemPatch = async (item: AgendaItemUI) => {
    if (!item.id || meeting?.agenda_locked) return
    const res = await fetch(`/api/board-meetings/${productionId}/agenda-items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast((body as { error?: string }).error || 'Failed to save item', 'error')
    }
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
    const sync = body.people_sync as {
      created?: number
      linked?: number
      matched_existing?: number
      skipped_placeholders?: number
    } | undefined
    const syncParts = [
      sync?.created ? `${sync.created} added to People` : null,
      sync?.matched_existing ? `${sync.matched_existing} already in People` : null,
      sync?.linked ? `${sync.linked} linked` : null,
    ].filter(Boolean)
    toast(
      syncParts.length ? `Agenda locked — ${syncParts.join(', ')}` : 'Agenda locked',
      'success',
    )
    load()
  }

  const unlockAgenda = async () => {
    if (!confirm('Unlock the agenda? You can edit items and lock again when ready.')) return
    setUnlocking(true)
    const res = await fetch(`/api/board-meetings/${productionId}/unlock-agenda`, { method: 'POST' })
    const body = await res.json()
    setUnlocking(false)
    if (!res.ok) {
      toast(body.error || 'Unlock failed', 'error')
      return
    }
    toast('Agenda unlocked', 'success')
    load()
  }

  const reopenMeeting = async () => {
    if (!confirm('Reopen this meeting? Control surface and live broadcast will be available again. Reassign output channels if needed.')) return
    setReopening(true)
    const res = await fetch(`/api/board-meetings/${productionId}/reopen-meeting`, { method: 'POST' })
    const body = await res.json()
    setReopening(false)
    if (!res.ok) {
      toast(body.error || 'Reopen failed', 'error')
      return
    }
    toast('Meeting reopened', 'success')
    load()
  }

  const resetMeeting = async () => {
    if (!confirm('Delete all board meeting data for this production? Agenda, motions, timers, and broadcast history will be removed. This cannot be undone.')) return
    setResetting(true)
    const res = await fetch(`/api/board-meetings/${productionId}/reset`, { method: 'POST' })
    const body = await res.json()
    setResetting(false)
    if (!res.ok) {
      toast(body.error || 'Reset failed', 'error')
      return
    }
    toast('Board meeting reset', 'success')
    setMeeting(null)
    setItems([])
    setPhase('empty')
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
          <PublicAgendaUrlCard
            productionId={productionId}
            initialUrl={meeting?.public_agenda_url}
            onSaved={url => setMeeting(m => (m ? { ...m, public_agenda_url: url } : m))}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <p style={{ margin: 0, color: muted, fontSize: '14px' }}>Review extracted items. Use arrows to reorder or remove items you do not need.</p>
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
            {orderedReviewItems.map((it, idx) => {
              const itemId = it.id
              const busy = reorderingId === itemId || deletingId === itemId
              const canMoveUp = idx > 0
              const canMoveDown = idx < orderedReviewItems.length - 1
              const actionBtn: React.CSSProperties = {
                fontSize: '12px',
                padding: '6px 10px',
                minHeight: '36px',
                borderRadius: '8px',
                background: 'transparent',
                color: text,
                border: `0.5px solid ${border}`,
                cursor: busy ? 'wait' : 'pointer',
                fontFamily: 'inherit',
              }
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
                    <div style={{ fontSize: '12px', color: muted }}>
                      §{it.section_number} {it.section_title} · {it.item_number}
                      {it.needs_review && <span style={{ color: '#e8a020', marginLeft: '8px' }}>Needs review</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      <button
                        type="button"
                        title="Move up"
                        disabled={!canMoveUp || busy || !itemId}
                        onClick={() => itemId && moveItem(itemId, 'up')}
                        style={{ ...actionBtn, opacity: canMoveUp && itemId ? 1 : 0.4 }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        title="Move down"
                        disabled={!canMoveDown || busy || !itemId}
                        onClick={() => itemId && moveItem(itemId, 'down')}
                        style={{ ...actionBtn, opacity: canMoveDown && itemId ? 1 : 0.4 }}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        title="Remove item"
                        disabled={busy || !itemId}
                        onClick={() => itemId && deleteItem(itemId)}
                        style={{ ...actionBtn, color: '#ef4444', opacity: itemId ? 1 : 0.4 }}
                      >
                        {deletingId === itemId ? '…' : 'Remove'}
                      </button>
                    </div>
                  </div>
                  <input
                    value={it.title}
                    onChange={e => updateItemById(itemId, { title: e.target.value })}
                    onBlur={() => {
                      const current = items.find(x => x.id === itemId)
                      if (current) saveItemPatch(current)
                    }}
                    style={{ ...inputStyle, marginBottom: '8px', fontWeight: 600 }}
                  />
                  <label style={{ display: 'block', fontSize: '12px', color: muted, marginBottom: '4px' }}>
                    Suggested motion text (optional)
                  </label>
                  <textarea
                    value={it.suggested_motion_text ?? ''}
                    placeholder="e.g. Move to approve the consent agenda as presented"
                    rows={2}
                    onChange={e =>
                      updateItemById(itemId, {
                        suggested_motion_text: e.target.value || null,
                      })
                    }
                    onBlur={() => {
                      const current = items.find(x => x.id === itemId)
                      if (current) saveItemPatch(current)
                    }}
                    style={{
                      ...inputStyle,
                      marginBottom: '8px',
                      resize: 'vertical',
                      minHeight: '52px',
                      fontWeight: 400,
                    }}
                  />
                  {it.review_notes && <p style={{ fontSize: '12px', color: '#e8a020', margin: '0 0 8px' }}>{it.review_notes}</p>}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
                    <select
                      value={it.type}
                      onChange={e => {
                        const nextType = e.target.value
                        updateItemById(itemId, { type: nextType })
                        saveItemPatch({ ...it, type: nextType })
                      }}
                      style={inputStyle}
                    >
                      <option value="procedural">Procedural</option>
                      <option value="information">Information</option>
                      <option value="action">Action</option>
                      <option value="recognition">Recognition</option>
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: muted, minHeight: '44px' }}>
                      <input
                        type="checkbox"
                        checked={it.is_broadcastable}
                        onChange={e => {
                          const checked = e.target.checked
                          updateItemById(itemId, { is_broadcastable: checked })
                          saveItemPatch({ ...it, is_broadcastable: checked })
                        }}
                      />
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
          <PublicAgendaUrlCard
            productionId={productionId}
            initialUrl={meeting?.public_agenda_url}
            onSaved={url => setMeeting(m => (m ? { ...m, public_agenda_url: url } : m))}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div>
              <p style={{ margin: 0, fontWeight: 600, color: text }}>Agenda locked</p>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: muted }}>
                Status: {meeting?.broadcast_status || 'prepared'} · {items.length} items
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              {meeting?.broadcast_status === 'prepared' && (
                <button
                  type="button"
                  onClick={unlockAgenda}
                  disabled={unlocking}
                  style={{ fontSize: '13px', padding: '8px 14px', minHeight: '40px', borderRadius: '8px', background: 'transparent', color: text, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {unlocking ? 'Unlocking…' : 'Unlock agenda'}
                </button>
              )}
              {meeting?.broadcast_status === 'live' && (
                <span style={{ fontSize: '12px', color: muted }}>End the live meeting from control surface to unlock.</span>
              )}
              {meeting?.broadcast_status === 'prepared' && (
                <button
                  type="button"
                  onClick={resetMeeting}
                  disabled={resetting}
                  style={{ fontSize: '13px', padding: '8px 14px', minHeight: '40px', borderRadius: '8px', background: 'transparent', color: '#ef4444', border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {resetting ? 'Deleting…' : 'Delete meeting data'}
                </button>
              )}
              {fileInput(true)}
            </div>
          </div>
          {meeting && ['prepared', 'live'].includes(meeting.broadcast_status) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
              <Link
                href={`/control/${productionId}`}
                style={{ fontSize: '14px', padding: '10px 16px', minHeight: '44px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}
              >
                Open control surface
              </Link>
              <Link
                href={`/dashboard/board-meetings/${productionId}/buttons`}
                style={{ fontSize: '14px', padding: '10px 16px', minHeight: '44px', borderRadius: '10px', border: `0.5px solid ${border}`, color: text, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
              >
                Companion buttons
              </Link>
            </div>
          )}
          <MeetingPlaylistSection productionId={productionId} />
          <div>
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

      {phase === 'readonly' && (
        <div>
          <div style={{ marginBottom: '16px' }}>
            <p style={{ margin: 0, fontWeight: 600, color: text }}>Meeting archived</p>
            <p style={{ margin: '4px 0 12px', fontSize: '13px', color: muted }}>{items.length} agenda items · broadcast complete</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
              {productionNumber && (
                <Link
                  href={`/board/meeting/${productionNumber}/archive`}
                  target="_blank"
                  style={{ fontSize: '14px', color: 'var(--brand-primary)', fontWeight: 600 }}
                >
                  View public archive →
                </Link>
              )}
              <GenerateChaptersButton productionId={productionId} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button
                type="button"
                onClick={reopenMeeting}
                disabled={reopening}
                style={{ fontSize: '14px', padding: '10px 16px', minHeight: '44px', borderRadius: '10px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
              >
                {reopening ? 'Reopening…' : 'Reopen meeting'}
              </button>
              <button
                type="button"
                onClick={resetMeeting}
                disabled={resetting}
                style={{ fontSize: '14px', padding: '10px 16px', minHeight: '44px', borderRadius: '10px', background: 'transparent', color: '#ef4444', border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {resetting ? 'Deleting…' : 'Delete meeting data'}
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {items.map(it => (
              <div key={it.id} style={{ padding: '12px 14px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '8px' }}>
                <span style={{ fontSize: '12px', color: muted }}>{it.item_number}</span>
                <span style={{ fontSize: '14px', color: text, fontWeight: 500, marginLeft: '8px' }}>{it.title}</span>
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
