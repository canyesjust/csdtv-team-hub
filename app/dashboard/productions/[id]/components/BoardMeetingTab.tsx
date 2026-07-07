'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import GenerateChaptersButton from '@/app/dashboard/board-meetings/[productionId]/components/GenerateChaptersButton'
import EditTimestampsButton from '@/app/dashboard/board-meetings/[productionId]/components/EditTimestampsButton'
import { useTheme } from '@/lib/theme'
import { confirmDialog } from '@/lib/confirm'
import Loader from '../../../components/Loader'
import { toast } from '@/lib/toast'
import type { AgendaItemUI, BoardMeetingRecord } from '@/lib/board-meetings/types'
import type { AgendaDiffEntry } from '@/lib/board-meetings/agenda-diff'
import MeetingPlaylistSection from './MeetingPlaylistSection'
import PublicAgendaUrlCard from './PublicAgendaUrlCard'
import AgendaWatchPreview from './AgendaWatchPreview'

type Phase = 'loading' | 'empty' | 'extracting' | 'review' | 'locked' | 'diff' | 'readonly'

export default function BoardMeetingTab({ productionId }: { productionId: string }) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const [phase, setPhase] = useState<Phase>('loading')
  const [portalInput, setPortalInput] = useState('')
  const [meeting, setMeeting] = useState<BoardMeetingRecord | null>(null)
  const [productionNumber, setProductionNumber] = useState<number | null>(null)
  const [meetingTitle, setMeetingTitle] = useState<string | null>(null)
  const [meetingDate, setMeetingDate] = useState<string | null>(null)
  // Guidance for new users: per-phase "next step" tips (collapsible for pros) and a
  // one-time "how it works" intro card. Both remembered in localStorage.
  const [showTips, setShowTips] = useState(true)
  const [introSeen, setIntroSeen] = useState(true)
  useEffect(() => {
    try {
      if (localStorage.getItem('csdtv-bm-tips') === '0') setShowTips(false)
      setIntroSeen(localStorage.getItem('csdtv-bm-intro-seen') === '1')
    } catch { /* ignore */ }
  }, [])
  const toggleTips = () =>
    setShowTips(v => {
      const next = !v
      try { localStorage.setItem('csdtv-bm-tips', next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  const dismissIntro = () => {
    setIntroSeen(true)
    try { localStorage.setItem('csdtv-bm-intro-seen', '1') } catch { /* ignore */ }
  }
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const toggleExpand = (id: string) =>
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Public start times per agenda section — auto-filled from the imported agenda,
  // editable inline in the review list. Drives the "Watch Board Meetings Live"
  // page's start label and per-section times.
  const [sectionTimes, setSectionTimes] = useState<Record<string, string>>({})
  useEffect(() => {
    setSectionTimes(meeting?.public_start_times?.sections || {})
  }, [meeting?.public_start_times])
  const saveSectionTimes = async (next: Record<string, string>) => {
    const clean: Record<string, string> = {}
    for (const [k, v] of Object.entries(next)) if (v) clean[k] = v
    const res = await fetch(`/api/board-meetings/${productionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_start_times: { meeting: null, sections: clean } }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast((body as { error?: string }).error || 'Failed to save start time', 'error')
      return
    }
    const body = await res.json()
    setMeeting(m => (m ? { ...m, public_start_times: body.board_meeting?.public_start_times ?? null } : m))
  }

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
    if (body.board_meeting?.icompass_meeting_id) setPortalInput(String(body.board_meeting.icompass_meeting_id))
    setProductionNumber(body.production?.production_number ?? null)
    setMeetingTitle(body.production?.title ?? null)
    setMeetingDate(body.production?.start_datetime ?? body.production?.event_date ?? null)
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

  const indexById = useMemo(
    () => new Map(orderedReviewItems.map((it, i) => [it.id, i])),
    [orderedReviewItems],
  )
  const reviewSections = useMemo(() => {
    const order: number[] = []
    const map = new Map<number, { number: number; title: string; items: AgendaItemUI[] }>()
    for (const it of orderedReviewItems) {
      if (!map.has(it.section_number)) {
        map.set(it.section_number, { number: it.section_number, title: it.section_title, items: [] })
        order.push(it.section_number)
      }
      map.get(it.section_number)!.items.push(it)
    }
    return order.map(n => map.get(n)!)
  }, [orderedReviewItems])
  const needsReviewCount = useMemo(
    () => orderedReviewItems.filter(i => i.needs_review).length,
    [orderedReviewItems],
  )
  const reviewSummary = useMemo(() => {
    const shown = orderedReviewItems.filter(i => i.is_broadcastable !== false)
    return {
      total: shown.length,
      actions: shown.filter(i => i.type === 'action' || i.action_requested).length,
      consent: shown.filter(i => i.consent_block).length,
      hidden: orderedReviewItems.length - shown.length,
    }
  }, [orderedReviewItems])

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

  const clearAgenda = async () => {
    const ok = await confirmDialog({
      title: 'Clear the extracted agenda?',
      message: 'This removes all imported agenda items so you can re-import from scratch. Only works before the agenda is locked.',
      confirmLabel: 'Clear agenda',
      tone: 'danger',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/board-meetings/${productionId}/clear-agenda`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { toast(body.error || 'Could not clear the agenda', 'error'); return }
      setItems([])
      setPhase('empty')
      toast('Agenda cleared — import again to start over', 'success')
    } catch {
      toast('Could not clear the agenda', 'error')
    }
  }

  const importFromPortal = async () => {
    if (!portalInput.trim()) { setError('Enter the meeting ID or agenda URL from the portal'); return }
    setError('')
    setPhase('extracting')
    try {
      const res = await fetch(`/api/board-meetings/${productionId}/import-agenda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meeting: portalInput.trim() }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Import failed'); setPhase('empty'); return }
      toast('Agenda imported from the portal — review items below', 'success')
      await load()
      setPhase('review')
    } catch {
      setError('Import failed. Check the ID/URL and try again.')
      setPhase('empty')
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
    if (!(await confirmDialog({ message: 'Remove this agenda item from the extracted agenda?', tone: 'danger', confirmLabel: 'Remove' }))) return
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
    if (!(await confirmDialog({ message: 'Unlock the agenda? You can edit items and lock again when ready.', confirmLabel: 'Unlock' }))) return
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
    if (!(await confirmDialog({ message: 'Reopen this meeting? Control surface and live broadcast will be available again. Reassign output channels if needed.', confirmLabel: 'Reopen' }))) return
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
    if (!(await confirmDialog({ message: 'Delete all board meeting data for this production? Agenda, motions, timers, and broadcast history will be removed. This cannot be undone.', tone: 'danger' }))) return
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
        background: 'var(--brand-primary)',
        color: '#fff',
        fontWeight: 500,
        minHeight: '44px',
        lineHeight: '24px',
      }}>
        {reupload ? 'Re-upload amended agenda' : 'Upload agenda PDF'}
      </span>
    </label>
  )

  const bcStatus = meeting?.broadcast_status
  const stepIndex =
    phase === 'readonly' || bcStatus === 'live' ? 4
    : meeting?.agenda_locked ? 3
    : (phase === 'review' || items.length > 0) ? 2
    : 1
  const STEP_LABELS = ['Import', 'Review', 'Lock', 'Live']
  const meetingDateLong = meetingDate
    ? new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(meetingDate))
    : null

  // One friendly "what do I do now / what's next" line per phase, for new operators.
  const guide: { step: string; text: string } | null =
    phase === 'empty'
      ? { step: 'Step 1 · Import', text: 'Paste the meeting’s agenda URL or its ID below and press Import. This pulls the agenda from the board portal — nothing is shown to the public yet.' }
      : phase === 'review'
      ? { step: 'Step 2 · Review & lock', text: 'Click any item to check or edit it, and fix anything highlighted amber. When it looks right, press “Lock agenda” at the bottom — locking is what publishes it to the dais and the public website.' }
      : phase === 'diff'
      ? { step: 'Review changes', text: 'The portal agenda changed. Review the differences below, uncheck anything you don’t want, then apply the update.' }
      : phase === 'locked' && bcStatus === 'live'
      ? { step: 'Live', text: 'The meeting is on air. Run it from the Control Surface — nothing more to do on this page.' }
      : phase === 'locked'
      ? { step: 'Step 3 · Broadcast', text: 'The agenda is locked and now public. On meeting day, open the Control Surface (button below) to run the broadcast. Use “Unlock” only if the agenda needs changes.' }
      : phase === 'readonly'
      ? { step: 'Done', text: 'This meeting is finished and archived. The agenda and recording stay public — there’s nothing to change here.' }
      : null

  const tipLink: React.CSSProperties = { background: 'transparent', border: 'none', color: 'var(--brand-primary)', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, whiteSpace: 'nowrap', padding: 0 }

  return (
    <div>
      {(meetingTitle || meetingDate) && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <span style={{ fontSize: '17px', fontWeight: 700, color: text }}>{meetingTitle || 'Board meeting'}</span>
            {meetingDateLong && <span style={{ fontSize: '13px', color: muted }}>{meetingDateLong}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {STEP_LABELS.map((label, i) => {
              const n = i + 1
              const done = n < stepIndex || phase === 'readonly'
              const active = n === stepIndex && phase !== 'readonly'
              const bg = done ? 'var(--brand-primary)' : active ? 'rgba(30,108,181,0.14)' : 'transparent'
              const fg = done ? '#fff' : active ? 'var(--brand-primary)' : muted
              return (
                <span key={label} style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, padding: '5px 11px', borderRadius: '999px', background: bg, color: fg, border: done || active ? 'none' : `0.5px solid ${border}` }}>
                    <span style={{ fontSize: '11px', opacity: 0.85 }}>{done ? '✓' : n}</span>{label}
                  </span>
                  {n < STEP_LABELS.length && <span style={{ width: '14px', height: '1px', background: border, margin: '0 2px' }} />}
                </span>
              )
            })}
            {phase === 'readonly' && <span style={{ fontSize: '12px', color: muted, marginLeft: '4px' }}>· Archived</span>}
            {!showTips && guide && (
              <button type="button" onClick={toggleTips} style={{ ...tipLink, marginLeft: 'auto' }}>Show tips</button>
            )}
          </div>
        </div>
      )}

      {!introSeen && (
        <div style={{ marginBottom: '16px', padding: '14px 16px', background: 'rgba(30,108,181,0.08)', border: '0.5px solid rgba(30,108,181,0.35)', borderRadius: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
            <strong style={{ fontSize: '14px', color: text }}>New here? How a board meeting works</strong>
            <button type="button" onClick={dismissIntro} style={tipLink}>Got it</button>
          </div>
          <ol style={{ margin: '8px 0 0', paddingLeft: '20px', color: muted, fontSize: '13px', lineHeight: 1.7 }}>
            <li><strong style={{ color: text }}>Import</strong> the agenda from the board portal (or a PDF).</li>
            <li><strong style={{ color: text }}>Review</strong> the items, then <strong style={{ color: text }}>Lock</strong> the agenda — this publishes it to the dais screen and the public website.</li>
            <li>On meeting day, open the <strong style={{ color: text }}>Control Surface</strong> to run the live broadcast (gavel in, motions, votes, lower thirds).</li>
          </ol>
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: muted }}>The step tracker above always shows where this meeting is. Tips on each screen tell you what to do next.</p>
        </div>
      )}

      {showTips && guide && introSeen && (
        <div style={{ marginBottom: '16px', padding: '12px 14px', background: 'rgba(30,108,181,0.06)', borderLeft: '3px solid var(--brand-primary)', borderRadius: '0 8px 8px 0', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--brand-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>{guide.step}</div>
            <div style={{ fontSize: '13.5px', color: text, lineHeight: 1.5 }}>{guide.text}</div>
          </div>
          <button type="button" onClick={toggleTips} style={tipLink}>Hide tips</button>
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 14px', marginBottom: '12px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {phase === 'empty' && (
        <div style={{ padding: '40px 24px', background: cardBg, borderRadius: '12px', border: `0.5px solid ${border}`, textAlign: 'center' }}>
          <p style={{ color: text, fontWeight: 600, marginBottom: '4px' }}>Import the agenda from the board portal</p>
          <p style={{ color: muted, fontSize: '13px', marginBottom: '14px' }}>Pulls items exactly as listed — no AI rewriting. Paste the meeting&apos;s agenda URL or its ID.</p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', maxWidth: '520px', margin: '0 auto' }}>
            <input
              value={portalInput}
              onChange={e => setPortalInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void importFromPortal() }}
              placeholder="Agenda URL or meeting ID (e.g. 478)"
              style={{ flex: 1, minWidth: '220px', height: '44px', padding: '0 12px', borderRadius: '10px', border: `1px solid ${border}`, background: 'transparent', color: text, fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            <button type="button" onClick={() => void importFromPortal()} style={{ fontSize: '14px', padding: '0 18px', height: '44px', borderRadius: '10px', background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
              Import agenda
            </button>
          </div>
          <div style={{ marginTop: '20px', paddingTop: '18px', borderTop: `0.5px solid ${border}` }}>
            <p style={{ color: muted, fontSize: '13px', marginBottom: '12px' }}>Or upload a BoardDocs PDF (uses AI extraction):</p>
            {fileInput(false)}
          </div>
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
            <div>
              <p style={{ margin: 0, color: muted, fontSize: '14px' }}>Click an item to edit it. Flagged items are highlighted. The preview shows the public view.</p>
              <p style={{ margin: '4px 0 0', color: text, fontSize: '13px', fontWeight: 600 }}>
                Goes public when locked: {reviewSummary.total} item{reviewSummary.total === 1 ? '' : 's'} · {reviewSummary.actions} action{reviewSummary.actions === 1 ? '' : 's'}
                {reviewSummary.consent > 0 ? ` · ${reviewSummary.consent} consent` : ''}
                {reviewSummary.hidden > 0 ? <span style={{ color: muted, fontWeight: 400 }}>{` · ${reviewSummary.hidden} hidden`}</span> : ''}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={clearAgenda}
                disabled={locking || items.length === 0}
                style={{ fontSize: '14px', padding: '10px 16px', minHeight: '44px', borderRadius: '10px', background: 'transparent', color: text, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Clear &amp; re-import
              </button>
              <button
                type="button"
                onClick={lockAgenda}
                disabled={locking || items.length === 0}
                style={{ fontSize: '14px', padding: '10px 20px', minHeight: '44px', borderRadius: '10px', background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
              >
                {locking ? 'Locking…' : 'Lock agenda'}
              </button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 380px', gap: '20px', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
            {needsReviewCount > 0 && (
              <div style={{ fontSize: '13px', color: '#9a6a00', background: dark ? 'rgba(232,160,32,0.12)' : '#fff8eb', border: '0.5px solid rgba(232,160,32,0.4)', borderRadius: '8px', padding: '8px 12px' }}>
                {needsReviewCount} item{needsReviewCount === 1 ? '' : 's'} flagged to review — highlighted below.
              </div>
            )}
            {reviewSections.map(sec => (
              <div key={sec.number}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '.05em', flex: 1, minWidth: 0 }}>
                    {sec.number} · {sec.title}
                  </span>
                  <input
                    type="time"
                    value={sectionTimes[String(sec.number)] || ''}
                    onChange={e => setSectionTimes(s => ({ ...s, [String(sec.number)]: e.target.value }))}
                    onBlur={() => saveSectionTimes(sectionTimes)}
                    title="Start time shown on the public Watch page (from the agenda; edit if needed)"
                    style={{ fontSize: '12px', padding: '4px 7px', borderRadius: '6px', border: `0.5px solid ${border}`, background: inputBg, color: text, fontFamily: 'inherit' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {sec.items.map(it => {
                    const itemId = it.id
                    const idx = itemId ? indexById.get(itemId) ?? -1 : -1
                    const open = !!itemId && expandedIds.has(itemId)
                    const busy = reorderingId === itemId || deletingId === itemId
                    const canMoveUp = idx > 0
                    const canMoveDown = idx >= 0 && idx < orderedReviewItems.length - 1
                    const isAction = it.type === 'action' || it.action_requested
                    const isConsent = !!it.consent_block
                    const actionBtn: React.CSSProperties = { fontSize: '12px', padding: '6px 9px', minHeight: '34px', borderRadius: '8px', background: 'transparent', color: text, border: `0.5px solid ${border}`, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }
                    const tag = (label: string, bg: string, fg: string) => (
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '5px', background: bg, color: fg, textTransform: 'uppercase', letterSpacing: '.03em', flexShrink: 0 }}>{label}</span>
                    )
                    return (
                      <div key={it.id || `${it.item_number}-${idx}`} style={{ border: `0.5px solid ${it.needs_review ? 'rgba(232,160,32,0.5)' : border}`, borderRadius: '9px', background: it.needs_review ? (dark ? 'rgba(232,160,32,0.08)' : '#fff8eb') : cardBg, overflow: 'hidden' }}>
                        <div onClick={() => itemId && toggleExpand(itemId)} style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 11px', cursor: itemId ? 'pointer' : 'default' }}>
                          <span style={{ color: muted, fontSize: '11px', width: '12px', flexShrink: 0 }}>{open ? '▾' : '▸'}</span>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: muted, minWidth: '22px', flexShrink: 0 }}>{it.item_number}</span>
                          <span style={{ fontSize: '13.5px', color: text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: it.needs_review ? 600 : 400 }}>{isConsent ? 'Consent Agenda' : it.title}</span>
                          {isConsent && tag('consent', dark ? 'rgba(123,97,255,0.18)' : '#efeaff', '#6a4ad0')}
                          {isAction && tag('action', dark ? 'rgba(232,160,32,0.18)' : '#fdebc8', '#9a6a00')}
                          {!it.is_broadcastable && tag('hidden', 'transparent', muted)}
                          {it.needs_review && <span title="Needs review" style={{ color: '#e8a020', fontSize: '12px', flexShrink: 0 }}>●</span>}
                        </div>
                        {open && (
                          <div style={{ padding: '0 11px 12px', borderTop: `0.5px solid ${border}` }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px', margin: '8px 0' }}>
                              <button type="button" title="Move up" disabled={!canMoveUp || busy || !itemId} onClick={() => itemId && moveItem(itemId, 'up')} style={{ ...actionBtn, opacity: canMoveUp && itemId ? 1 : 0.4 }}>↑</button>
                              <button type="button" title="Move down" disabled={!canMoveDown || busy || !itemId} onClick={() => itemId && moveItem(itemId, 'down')} style={{ ...actionBtn, opacity: canMoveDown && itemId ? 1 : 0.4 }}>↓</button>
                              <button type="button" title="Remove item" disabled={busy || !itemId} onClick={() => itemId && deleteItem(itemId)} style={{ ...actionBtn, color: '#ef4444' }}>{deletingId === itemId ? '…' : 'Remove'}</button>
                            </div>
                            <input
                              value={it.title}
                              onChange={e => updateItemById(itemId, { title: e.target.value })}
                              onBlur={() => { const c = items.find(x => x.id === itemId); if (c) saveItemPatch(c) }}
                              style={{ ...inputStyle, marginBottom: '8px', fontWeight: 600 }}
                            />
                            {isConsent && Array.isArray(it.subitems) && (it.subitems as { item_number?: string; title?: string }[]).length > 0 && (
                              <div style={{ marginBottom: '8px', padding: '8px 10px', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px' }}>
                                <div style={{ fontSize: '11px', color: muted, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700, marginBottom: '4px' }}>
                                  Consent items ({(it.subitems as unknown[]).length}) — voted together
                                </div>
                                {(it.subitems as { item_number?: string; title?: string }[]).map((s, si) => (
                                  <div key={si} style={{ fontSize: '12.5px', color: text, padding: '2px 0', display: 'flex', gap: '7px' }}>
                                    <span style={{ fontWeight: 700, color: muted, minWidth: '16px' }}>{s.item_number || ''}</span>
                                    <span>{s.title || ''}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {isAction && (
                              <>
                                <label style={{ display: 'block', fontSize: '12px', color: muted, marginBottom: '4px' }}>Suggested motion text (optional)</label>
                                <textarea
                                  value={it.suggested_motion_text ?? ''}
                                  placeholder="e.g. Move to approve the consent agenda as presented"
                                  rows={2}
                                  onChange={e => updateItemById(itemId, { suggested_motion_text: e.target.value || null })}
                                  onBlur={() => { const c = items.find(x => x.id === itemId); if (c) saveItemPatch(c) }}
                                  style={{ ...inputStyle, marginBottom: '8px', resize: 'vertical', minHeight: '52px', fontWeight: 400 }}
                                />
                              </>
                            )}
                            {it.review_notes && <p style={{ fontSize: '12px', color: '#e8a020', margin: '0 0 8px' }}>{it.review_notes}</p>}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
                              <select value={it.type} onChange={e => { const nt = e.target.value; updateItemById(itemId, { type: nt }); saveItemPatch({ ...it, type: nt }) }} style={inputStyle}>
                                <option value="procedural">Procedural</option>
                                <option value="information">Information</option>
                                <option value="action">Action</option>
                                <option value="recognition">Recognition</option>
                              </select>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: muted, minHeight: '44px' }} title="When on, this item appears on the dais, the broadcast overlay, and the public website agenda. Turn it off to keep an internal item off-screen.">
                                <input type="checkbox" checked={it.is_broadcastable} onChange={e => { const c = e.target.checked; updateItemById(itemId, { is_broadcastable: c }); saveItemPatch({ ...it, is_broadcastable: c }) }} />
                                Show on screen &amp; public agenda
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <AgendaWatchPreview items={orderedReviewItems} />
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
                style={{ fontSize: '14px', padding: '10px 16px', minHeight: '44px', borderRadius: '10px', background: 'var(--brand-primary)', color: '#fff', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}
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
          <div style={{ marginTop: '16px', maxWidth: '440px' }}>
            <AgendaWatchPreview items={items} />
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
              <EditTimestampsButton productionId={productionId} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button
                type="button"
                onClick={reopenMeeting}
                disabled={reopening}
                style={{ fontSize: '14px', padding: '10px 16px', minHeight: '44px', borderRadius: '10px', background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
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
            style={{ fontSize: '14px', padding: '10px 20px', minHeight: '44px', borderRadius: '10px', background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
          >
            Apply changes
          </button>
        </div>
      )}
    </div>
  )
}
