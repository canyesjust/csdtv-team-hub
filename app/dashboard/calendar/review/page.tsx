'use client'

import { useEffect, useState, useCallback, useMemo, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { canManageCalendarQueue } from '@/lib/calendar-access'
import { toast } from '@/lib/toast'
import { confirmDialog } from '@/lib/confirm'
import { formatDateTime } from '@/lib/format-date'
import { AsyncButton } from '../../components/AsyncButton'

type CalCategory = 'athletics' | 'arts' | 'academics' | 'closures'

const CATEGORIES: { value: CalCategory; label: string }[] = [
  { value: 'athletics', label: 'Athletics' },
  { value: 'arts', label: 'Arts' },
  { value: 'academics', label: 'Academics' },
  { value: 'closures', label: 'Closures & Announcements' },
]
const CAT_LABEL: Record<CalCategory, string> = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label])) as Record<CalCategory, string>

type EventStatus = 'needs_review' | 'visible' | 'hidden' | 'updated' | 'removed'
type Origin = 'synced' | 'manual' | 'submitted'

type School = { id: string; name: string; primary_color: string | null }

type EventRow = {
  id: string
  school_id: string
  feed_id: string | null
  source_uid: string | null
  origin: Origin
  category: CalCategory
  is_recurring: boolean
  recurrence_group_id: string | null
  source_title: string | null
  source_start: string | null
  source_end: string | null
  source_location: string | null
  source_description: string | null
  title: string
  start_time: string
  end_time: string | null
  location: string | null
  description: string | null
  is_streaming: boolean
  stream_url: string | null
  status: EventStatus
  submitted_by_name: string | null
  submitted_by_email: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

type EditDraft = {
  title: string
  category: CalCategory
  start: string
  end: string
  location: string
  description: string
  is_streaming: boolean
  stream_url: string
}

type RowAction = 'approve' | 'reject' | 'accept_incoming' | 'keep_current' | 'acknowledge' | 'restore' | 'publish'

type Palette = { text: string; muted: string; border: string; cardBg: string; inputBg: string }

const STATUS_TONE: Record<EventStatus, { bg: string; color: string; label: string }> = {
  needs_review: { bg: 'rgba(30,108,181,0.14)', color: '#1e6cb5', label: 'Needs review' },
  updated: { bg: 'rgba(217,119,6,0.14)', color: '#d97706', label: 'Changed' },
  removed: { bg: 'rgba(239,68,68,0.14)', color: '#ef4444', label: 'Removed from source' },
  visible: { bg: 'rgba(22,163,74,0.14)', color: '#16a34a', label: 'Visible' },
  hidden: { bg: 'rgba(107,114,128,0.16)', color: '#6b7280', label: 'Hidden' },
}

const ORIGIN_LABEL: Record<Origin, string> = { synced: 'Synced', manual: 'Manual', submitted: 'Submitted' }

function toDateTimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDateTimeLocal(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function draftFromRow(row: EventRow, useSource: boolean): EditDraft {
  return {
    title: (useSource ? row.source_title : row.title) || row.title,
    category: row.category,
    start: toDateTimeLocal(useSource ? (row.source_start || row.start_time) : row.start_time),
    end: toDateTimeLocal(useSource ? row.source_end : row.end_time),
    location: (useSource ? row.source_location : row.location) || '',
    description: (useSource ? row.source_description : row.description) || '',
    is_streaming: row.is_streaming,
    stream_url: row.stream_url || '',
  }
}

async function notifySubmitterRejected(row: EventRow) {
  if (row.origin !== 'submitted' || !row.submitted_by_email) return
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return
  try {
    await fetch(`${url}/functions/v1/send-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify({
        recipientEmail: row.submitted_by_email,
        recipientName: row.submitted_by_name || undefined,
        subject: "Your submitted event wasn't published",
        body: `Thanks for submitting "${row.title}" to the CSDtv district calendar. After review, our team decided not to publish it as submitted.\n\nIf you have questions, reach out to the CSDtv office.`,
      }),
    })
  } catch {
    // Best-effort only -- never block the reject action on email delivery.
  }
}

function EventCard({
  row, palette, school, seriesCount, selected, expanded, draft, canSelect,
  onToggleSelect, onToggleExpand, onDraftChange, onAction, onSeriesAction,
}: {
  row: EventRow
  palette: Palette
  school: School | undefined
  seriesCount: number
  selected: boolean
  expanded: boolean
  draft: EditDraft | undefined
  canSelect: boolean
  onToggleSelect: (id: string) => void
  onToggleExpand: (row: EventRow) => void
  onDraftChange: (id: string, patch: Partial<EditDraft>) => void
  onAction: (row: EventRow, action: RowAction, draft: EditDraft | undefined) => void
  onSeriesAction: (row: EventRow, action: 'approve' | 'reject') => void
}) {
  const { text, muted, border, cardBg, inputBg } = palette
  const tone = STATUS_TONE[row.status]
  const accent = school?.primary_color || '#1e6cb5'

  const inputStyle = {
    width: '100%', height: '38px', borderRadius: '9px',
    border: `0.5px solid ${border}`, background: inputBg, color: text,
    padding: '0 11px', fontSize: '13.5px', fontFamily: 'inherit', boxSizing: 'border-box' as const,
  }

  return (
    <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' as const }}>
        {canSelect && (
          <input type="checkbox" checked={selected} onChange={() => onToggleSelect(row.id)} style={{ width: '17px', height: '17px', marginTop: '3px', flexShrink: 0 }} />
        )}
        <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: accent, marginTop: '6px', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: '220px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' as const, marginBottom: '3px' }}>
            <p style={{ fontSize: '15px', fontWeight: 600, color: text, margin: 0 }}>{row.title}</p>
            <span style={{ fontSize: '11px', fontWeight: 600, color: tone.color, background: tone.bg, padding: '2px 8px', borderRadius: '20px' }}>{tone.label}</span>
            {row.is_recurring && <span style={{ fontSize: '11px', fontWeight: 500, color: muted, background: inputBg, padding: '2px 8px', borderRadius: '20px' }}>Series{seriesCount > 1 ? ` · ${seriesCount}` : ''}</span>}
          </div>
          <p style={{ fontSize: '13px', color: muted, margin: 0 }}>
            {school?.name || 'Unknown school'} · {CAT_LABEL[row.category]} · {ORIGIN_LABEL[row.origin]}
            {row.origin === 'submitted' && row.submitted_by_name ? ` (${row.submitted_by_name})` : ''}
          </p>
          <p style={{ fontSize: '13px', color: muted, margin: '2px 0 0' }}>
            {formatDateTime(row.start_time)}{row.end_time ? ` – ${formatDateTime(row.end_time)}` : ''}
          </p>
        </div>
        <button onClick={() => onToggleExpand(row)} style={{
          fontSize: '13px', padding: '7px 12px', borderRadius: '8px', background: 'transparent',
          color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', minHeight: '34px', flexShrink: 0,
        }}>{expanded ? 'Close' : 'Edit'}</button>
      </div>

      {row.status === 'updated' && (
        <div style={{ background: inputBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '12px', fontSize: '13px', color: muted, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
          <div>
            <p style={{ margin: '0 0 4px', fontWeight: 600, color: text }}>Currently live</p>
            <p style={{ margin: 0 }}>{row.title}</p>
            <p style={{ margin: 0 }}>{formatDateTime(row.start_time)}{row.end_time ? ` – ${formatDateTime(row.end_time)}` : ''}</p>
            {row.location && <p style={{ margin: 0 }}>{row.location}</p>}
          </div>
          <div>
            <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#d97706' }}>Incoming from source</p>
            <p style={{ margin: 0 }}>{row.source_title}</p>
            <p style={{ margin: 0 }}>{formatDateTime(row.source_start)}{row.source_end ? ` – ${formatDateTime(row.source_end)}` : ''}</p>
            {row.source_location && <p style={{ margin: 0 }}>{row.source_location}</p>}
          </div>
        </div>
      )}

      {row.status === 'removed' && (
        <p style={{ fontSize: '13px', color: muted, margin: 0 }}>No longer on the source calendar. Acknowledge to clear it from the active queue.</p>
      )}

      {expanded && draft && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', paddingTop: '4px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Title</label>
            <input value={draft.title} onChange={(e: ChangeEvent<HTMLInputElement>) => onDraftChange(row.id, { title: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Category</label>
            <select value={draft.category} onChange={(e: ChangeEvent<HTMLSelectElement>) => onDraftChange(row.id, { category: e.target.value as CalCategory })} style={inputStyle}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Location</label>
            <input value={draft.location} onChange={(e: ChangeEvent<HTMLInputElement>) => onDraftChange(row.id, { location: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Starts</label>
            <input type="datetime-local" value={draft.start} onChange={(e: ChangeEvent<HTMLInputElement>) => onDraftChange(row.id, { start: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Ends (optional)</label>
            <input type="datetime-local" value={draft.end} onChange={(e: ChangeEvent<HTMLInputElement>) => onDraftChange(row.id, { end: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Description</label>
            <textarea value={draft.description} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onDraftChange(row.id, { description: e.target.value })} style={{ ...inputStyle, height: '76px', padding: '9px 11px', resize: 'vertical' as const, lineHeight: 1.5 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="checkbox" checked={draft.is_streaming} onChange={(e: ChangeEvent<HTMLInputElement>) => onDraftChange(row.id, { is_streaming: e.target.checked })} style={{ width: '17px', height: '17px' }} />
            <label style={{ fontSize: '13px', color: text }}>Streaming</label>
          </div>
          {draft.is_streaming && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '12px', color: muted, display: 'block', marginBottom: '4px' }}>Stream URL</label>
              <input value={draft.stream_url} onChange={(e: ChangeEvent<HTMLInputElement>) => onDraftChange(row.id, { stream_url: e.target.value })} style={inputStyle} />
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const, alignItems: 'center' }}>
        {(row.status === 'needs_review') && (
          <AsyncButton onClick={() => onAction(row, 'approve', draft)} pendingLabel="Approving…" style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: '#16a34a', color: '#fff', border: 'none', fontWeight: 500, minHeight: '36px' }}>Approve</AsyncButton>
        )}
        {row.status === 'updated' && (
          <>
            <AsyncButton onClick={() => onAction(row, 'accept_incoming', draft)} pendingLabel="Saving…" style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: '#16a34a', color: '#fff', border: 'none', fontWeight: 500, minHeight: '36px' }}>Accept incoming</AsyncButton>
            <AsyncButton onClick={() => onAction(row, 'keep_current', draft)} pendingLabel="Saving…" style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: 'transparent', color: text, border: `0.5px solid ${border}`, fontWeight: 500, minHeight: '36px' }}>Keep current</AsyncButton>
          </>
        )}
        {(row.status === 'needs_review' || row.status === 'updated' || row.status === 'visible') && (
          <AsyncButton onClick={() => onAction(row, 'reject', draft)} pendingLabel="…" style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: 'transparent', color: '#ef4444', border: '0.5px solid rgba(239,68,68,0.3)', fontWeight: 500, minHeight: '36px' }}>{row.status === 'visible' ? 'Unpublish' : 'Reject'}</AsyncButton>
        )}
        {row.status === 'removed' && (
          <AsyncButton onClick={() => onAction(row, 'acknowledge', draft)} pendingLabel="…" style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: 'transparent', color: text, border: `0.5px solid ${border}`, fontWeight: 500, minHeight: '36px' }}>Acknowledge</AsyncButton>
        )}
        {row.status === 'hidden' && (
          <>
            <AsyncButton onClick={() => onAction(row, 'publish', draft)} pendingLabel="…" style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: '#16a34a', color: '#fff', border: 'none', fontWeight: 500, minHeight: '36px' }}>Publish</AsyncButton>
            <AsyncButton onClick={() => onAction(row, 'restore', draft)} pendingLabel="…" style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: 'transparent', color: text, border: `0.5px solid ${border}`, fontWeight: 500, minHeight: '36px' }}>Restore to review</AsyncButton>
          </>
        )}

        {row.recurrence_group_id && seriesCount > 1 && (row.status === 'needs_review' || row.status === 'updated') && (
          <>
            <span style={{ color: muted, fontSize: '12px' }}>or</span>
            <button onClick={() => onSeriesAction(row, 'approve')} style={{ fontSize: '12.5px', color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>Approve all {seriesCount} in series</button>
            <button onClick={() => onSeriesAction(row, 'reject')} style={{ fontSize: '12.5px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>Reject all {seriesCount}</button>
          </>
        )}
      </div>
    </div>
  )
}

export default function CalendarReviewPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const palette: Palette = {
    text: dark ? '#f0f4ff' : '#1a1f36',
    muted: dark ? '#94a3b8' : '#6b7280',
    border: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
    cardBg: dark ? '#0d1525' : '#ffffff',
    inputBg: dark ? '#0a0f1e' : '#f8f9fc',
  }
  const { text, muted, border, inputBg } = palette

  const router = useRouter()
  const supabase = createClient()

  const [ready, setReady] = useState(false)
  const [allowed, setAllowed] = useState(false)
  const [teamId, setTeamId] = useState<string | null>(null)
  const [schools, setSchools] = useState<School[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'queue' | 'visible' | 'hidden' | 'all'>('queue')
  const [schoolFilter, setSchoolFilter] = useState('')
  const [originFilter, setOriginFilter] = useState<'' | Origin>('')
  const [categoryFilter, setCategoryFilter] = useState<'' | CalCategory>('')
  const [sortBy, setSortBy] = useState<'start_asc' | 'start_desc' | 'created_desc'>('created_desc')

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, EditDraft>>({})
  const [bulkCategory, setBulkCategory] = useState<CalCategory>('athletics')

  const loadData = useCallback(async () => {
    setLoading(true)
    const [{ data: schoolRows }, { data: eventRows }] = await Promise.all([
      supabase.from('schools').select('id, name, primary_color')
        .or('type.eq.school,name.eq.Board of Education,name.eq.Canyons School District')
        .eq('active', true).order('name'),
      supabase.from('calendar_school_events').select('*').order('created_at', { ascending: false }),
    ])
    setSchools(schoolRows || [])
    setEvents((eventRows || []) as EventRow[])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    let cancelled = false
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.replace('/login?redirect=/dashboard/calendar/review')
        return
      }
      const { data: teamRow } = await supabase.from('team').select('id, calendar_approver').eq('supabase_user_id', session.user.id).maybeSingle()
      if (cancelled) return
      if (!canManageCalendarQueue(teamRow?.calendar_approver)) {
        router.replace('/dashboard/calendar')
        return
      }
      setTeamId(teamRow?.id ?? null)
      setAllowed(true)
      await loadData()
      if (!cancelled) setReady(true)
    }
    init()
    return () => { cancelled = true }
  }, [supabase, router, loadData])

  const schoolMap = useMemo(() => new Map(schools.map(s => [s.id, s])), [schools])

  const seriesCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of events) {
      if (!e.recurrence_group_id) continue
      counts.set(e.recurrence_group_id, (counts.get(e.recurrence_group_id) || 0) + 1)
    }
    return counts
  }, [events])

  const filtered = useMemo(() => {
    let list = events
    if (statusFilter === 'queue') list = list.filter(e => e.status === 'needs_review' || e.status === 'updated' || e.status === 'removed')
    else if (statusFilter === 'visible') list = list.filter(e => e.status === 'visible')
    else if (statusFilter === 'hidden') list = list.filter(e => e.status === 'hidden')
    if (schoolFilter) list = list.filter(e => e.school_id === schoolFilter)
    if (originFilter) list = list.filter(e => e.origin === originFilter)
    if (categoryFilter) list = list.filter(e => e.category === categoryFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(e => e.title.toLowerCase().includes(q) || (schoolMap.get(e.school_id)?.name || '').toLowerCase().includes(q))
    }
    const sorted = [...list]
    if (sortBy === 'start_asc') sorted.sort((a, b) => a.start_time.localeCompare(b.start_time))
    else if (sortBy === 'start_desc') sorted.sort((a, b) => b.start_time.localeCompare(a.start_time))
    else sorted.sort((a, b) => b.created_at.localeCompare(a.created_at))
    return sorted
  }, [events, statusFilter, schoolFilter, originFilter, categoryFilter, search, sortBy, schoolMap])

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleExpand(row: EventRow) {
    if (expandedId === row.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(row.id)
    setDrafts(prev => (prev[row.id] ? prev : { ...prev, [row.id]: draftFromRow(row, row.status === 'updated') }))
  }

  function updateDraft(id: string, patch: Partial<EditDraft>) {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } as EditDraft }))
  }

  function patchForAction(row: EventRow, action: RowAction, draft: EditDraft | undefined): Record<string, unknown> {
    const nowIso = new Date().toISOString()
    switch (action) {
      case 'approve':
        return {
          status: 'visible', approved_by: teamId, approved_at: nowIso,
          ...(draft ? {
            title: draft.title.trim() || row.title,
            category: draft.category,
            start_time: fromDateTimeLocal(draft.start) || row.start_time,
            end_time: fromDateTimeLocal(draft.end),
            location: draft.location.trim() || null,
            description: draft.description.trim() || null,
            is_streaming: draft.is_streaming,
            stream_url: draft.is_streaming ? (draft.stream_url.trim() || null) : null,
          } : {}),
        }
      case 'accept_incoming':
        return {
          status: 'visible', approved_by: teamId, approved_at: nowIso,
          title: (draft?.title.trim()) || row.source_title || row.title,
          category: draft?.category ?? row.category,
          start_time: (draft ? fromDateTimeLocal(draft.start) : row.source_start) || row.start_time,
          end_time: draft ? fromDateTimeLocal(draft.end) : row.source_end,
          location: (draft?.location.trim()) ?? row.source_location,
          description: (draft?.description.trim()) ?? row.source_description,
          is_streaming: draft?.is_streaming ?? row.is_streaming,
          stream_url: (draft?.is_streaming ?? row.is_streaming) ? ((draft?.stream_url.trim()) ?? row.stream_url) : null,
        }
      case 'keep_current':
        return { status: 'visible', approved_by: teamId, approved_at: nowIso }
      case 'reject':
        return { status: 'hidden' }
      case 'acknowledge':
        return { status: 'hidden' }
      case 'restore':
        return { status: 'needs_review' }
      case 'publish':
        return { status: 'visible', approved_by: teamId, approved_at: nowIso }
    }
  }

  async function runAction(row: EventRow, action: RowAction, draft: EditDraft | undefined) {
    const patch = patchForAction(row, action, draft)
    const { data, error } = await supabase.from('calendar_school_events').update(patch).eq('id', row.id).select('*').single()
    if (error) {
      toast(error.message, 'error')
      return
    }
    setEvents(prev => prev.map(e => (e.id === row.id ? (data as EventRow) : e)))
    setSelected(prev => { const next = new Set(prev); next.delete(row.id); return next })
    if (expandedId === row.id) setExpandedId(null)
    if (action === 'reject') void notifySubmitterRejected(row)
    toast('Saved', 'success')
  }

  async function runSeriesAction(row: EventRow, action: 'approve' | 'reject') {
    if (!row.recurrence_group_id) return
    const siblings = events.filter(e => e.recurrence_group_id === row.recurrence_group_id && (e.status === 'needs_review' || e.status === 'updated'))
    if (!(await confirmDialog({ message: `Apply "${action === 'approve' ? 'Approve' : 'Reject'}" to all ${siblings.length} occurrences in this series?`, tone: action === 'reject' ? 'danger' : 'default', confirmLabel: action === 'approve' ? 'Approve all' : 'Reject all' }))) return
    for (const sibling of siblings) {
      const act: RowAction = action === 'approve' ? (sibling.status === 'updated' ? 'accept_incoming' : 'approve') : 'reject'
      await runAction(sibling, act, undefined)
    }
  }

  async function runBatch(action: 'approve' | 'reject') {
    const rows = filtered.filter(e => selected.has(e.id))
    if (rows.length === 0) return
    if (!(await confirmDialog({ message: `${action === 'approve' ? 'Approve' : 'Reject'} ${rows.length} selected event${rows.length === 1 ? '' : 's'}?`, tone: action === 'reject' ? 'danger' : 'default', confirmLabel: action === 'approve' ? 'Approve' : 'Reject' }))) return
    for (const row of rows) {
      const act: RowAction = action === 'approve' ? (row.status === 'updated' ? 'accept_incoming' : 'approve') : 'reject'
      await runAction(row, act, undefined)
    }
  }

  async function runBatchAcknowledge() {
    const rows = filtered.filter(e => selected.has(e.id))
    if (rows.length === 0) return
    if (!(await confirmDialog({
      message: `Acknowledge ${rows.length} selected event${rows.length === 1 ? '' : 's'}? This clears them out (removed-from-source events, or anything else selected) without deleting the record.`,
      confirmLabel: 'Acknowledge',
    }))) return
    for (const row of rows) {
      await runAction(row, 'acknowledge', undefined)
    }
  }

  async function runBulkCategory() {
    const rows = filtered.filter(e => selected.has(e.id))
    if (rows.length === 0) return
    if (!(await confirmDialog({
      message: `Set category to "${CAT_LABEL[bulkCategory]}" for ${rows.length} selected event${rows.length === 1 ? '' : 's'}? This applies whether or not they're already approved.`,
      confirmLabel: 'Apply',
    }))) return
    const ids = rows.map(r => r.id)
    const { data, error } = await supabase
      .from('calendar_school_events')
      .update({ category: bulkCategory, updated_at: new Date().toISOString() })
      .in('id', ids)
      .select('*')
    if (error) {
      toast(error.message, 'error')
      return
    }
    const byId = new Map((data as EventRow[]).map(r => [r.id, r]))
    setEvents(prev => prev.map(e => byId.get(e.id) || e))
    toast(`Category set to ${CAT_LABEL[bulkCategory]} for ${rows.length} event${rows.length === 1 ? '' : 's'}`, 'success')
  }

  if (!ready) {
    return <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '40px 20px', color: muted, fontSize: '15px' }}>Loading…</div>
  }
  if (!allowed) return null

  const selectableCount = filtered.length

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' as const, marginBottom: '6px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: text, margin: '0 0 6px' }}>Review queue</h1>
          <p style={{ fontSize: '15px', color: muted, margin: 0, lineHeight: 1.5, maxWidth: '640px' }}>
            New, changed, and removed events from synced feeds and public submissions. Nothing shows on the district
            calendar until it&apos;s approved here.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' as const }}>
          <Link href="/dashboard/calendar/feeds" style={{
            fontSize: '13.5px', padding: '9px 16px', borderRadius: '10px', background: 'transparent', color: muted,
            border: `0.5px solid ${border}`, textDecoration: 'none', fontWeight: 500, display: 'flex', alignItems: 'center', minHeight: '38px',
          }}>Calendar feeds</Link>
          <Link href="/calendar" target="_blank" style={{
            fontSize: '13.5px', padding: '9px 16px', borderRadius: '10px', background: 'transparent', color: muted,
            border: `0.5px solid ${border}`, textDecoration: 'none', fontWeight: 500, display: 'flex', alignItems: 'center', minHeight: '38px',
          }}>View public calendar ↗</Link>
        </div>
      </div>
      <div style={{ marginBottom: '20px' }} />

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' as const, marginBottom: '16px', alignItems: 'center' }}>
        <input
          value={search}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          placeholder="Search title or school..."
          style={{ height: '38px', minWidth: '220px', borderRadius: '9px', border: `0.5px solid ${border}`, background: inputBg, color: text, padding: '0 12px', fontSize: '13.5px', fontFamily: 'inherit' }}
        />
        <select value={statusFilter} onChange={(e: ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value as typeof statusFilter)} style={{ height: '38px', borderRadius: '9px', border: `0.5px solid ${border}`, background: inputBg, color: text, padding: '0 10px', fontSize: '13.5px', fontFamily: 'inherit' }}>
          <option value="queue">Needs review & changes</option>
          <option value="visible">Visible</option>
          <option value="hidden">Hidden</option>
          <option value="all">All</option>
        </select>
        <select value={schoolFilter} onChange={(e: ChangeEvent<HTMLSelectElement>) => setSchoolFilter(e.target.value)} style={{ height: '38px', borderRadius: '9px', border: `0.5px solid ${border}`, background: inputBg, color: text, padding: '0 10px', fontSize: '13.5px', fontFamily: 'inherit' }}>
          <option value="">All schools</option>
          {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={originFilter} onChange={(e: ChangeEvent<HTMLSelectElement>) => setOriginFilter(e.target.value as typeof originFilter)} style={{ height: '38px', borderRadius: '9px', border: `0.5px solid ${border}`, background: inputBg, color: text, padding: '0 10px', fontSize: '13.5px', fontFamily: 'inherit' }}>
          <option value="">All origins</option>
          <option value="synced">Synced</option>
          <option value="manual">Manual</option>
          <option value="submitted">Submitted</option>
        </select>
        <select value={categoryFilter} onChange={(e: ChangeEvent<HTMLSelectElement>) => setCategoryFilter(e.target.value as '' | CalCategory)} style={{ height: '38px', borderRadius: '9px', border: `0.5px solid ${border}`, background: inputBg, color: text, padding: '0 10px', fontSize: '13.5px', fontFamily: 'inherit' }}>
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select value={sortBy} onChange={(e: ChangeEvent<HTMLSelectElement>) => setSortBy(e.target.value as typeof sortBy)} style={{ height: '38px', borderRadius: '9px', border: `0.5px solid ${border}`, background: inputBg, color: text, padding: '0 10px', fontSize: '13.5px', fontFamily: 'inherit' }}>
          <option value="created_desc">Newest first</option>
          <option value="start_asc">Event date (soonest)</option>
          <option value="start_desc">Event date (latest)</option>
        </select>
      </div>

      {selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: inputBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', flexWrap: 'wrap' as const }}>
          <span style={{ fontSize: '13.5px', color: text, fontWeight: 500 }}>{selected.size} selected</span>
          <AsyncButton onClick={() => runBatch('approve')} pendingLabel="Approving…" style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: '#16a34a', color: '#fff', border: 'none', fontWeight: 500, minHeight: '34px' }}>Approve selected</AsyncButton>
          <AsyncButton onClick={() => runBatch('reject')} pendingLabel="…" style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: 'transparent', color: '#ef4444', border: '0.5px solid rgba(239,68,68,0.3)', fontWeight: 500, minHeight: '34px' }}>Reject selected</AsyncButton>
          <AsyncButton onClick={runBatchAcknowledge} pendingLabel="…" style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: 'transparent', color: text, border: `0.5px solid ${border}`, fontWeight: 500, minHeight: '34px' }}>Acknowledge selected</AsyncButton>
          <span style={{ width: '1px', height: '20px', background: border }} />
          <select value={bulkCategory} onChange={(e: ChangeEvent<HTMLSelectElement>) => setBulkCategory(e.target.value as CalCategory)} style={{ height: '34px', borderRadius: '8px', border: `0.5px solid ${border}`, background: inputBg, color: text, padding: '0 8px', fontSize: '13px', fontFamily: 'inherit' }}>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <AsyncButton onClick={runBulkCategory} pendingLabel="Applying…" style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: 'transparent', color: text, border: `0.5px solid ${border}`, fontWeight: 500, minHeight: '34px' }}>Set category</AsyncButton>
          <button onClick={() => setSelected(new Set())} style={{ fontSize: '13px', color: muted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Clear selection</button>
        </div>
      )}

      {selectableCount > 0 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: muted, marginBottom: '12px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={selected.size === selectableCount && selectableCount > 0}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              if (e.target.checked) setSelected(new Set(filtered.map(x => x.id)))
              else setSelected(new Set())
            }}
            style={{ width: '16px', height: '16px' }}
          />
          Select all ({selectableCount})
        </label>
      )}

      {loading ? (
        <p style={{ color: muted, fontSize: '15px' }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: muted, fontSize: '14px', padding: '20px' }}>Nothing here right now.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(row => (
            <EventCard
              key={row.id}
              row={row}
              palette={palette}
              school={schoolMap.get(row.school_id)}
              seriesCount={row.recurrence_group_id ? (seriesCounts.get(row.recurrence_group_id) || 1) : 1}
              selected={selected.has(row.id)}
              expanded={expandedId === row.id}
              draft={drafts[row.id]}
              canSelect
              onToggleSelect={toggleSelect}
              onToggleExpand={toggleExpand}
              onDraftChange={updateDraft}
              onAction={runAction}
              onSeriesAction={runSeriesAction}
            />
          ))}
        </div>
      )}
    </div>
  )
}
