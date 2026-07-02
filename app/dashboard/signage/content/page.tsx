'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { confirmDialog } from '@/lib/confirm'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import SignageTargetingPicker, {
  SignagePageShell,
  formatSignageDate,
  useSignageAdminStyles,
  type TargetingValue,
} from '../components/SignageAdmin'
import { useSignage } from '../components/SignageProvider'
import CreateWithAI from '../components/CreateWithAI'
import { SIGNAGE_DEFAULT_DISPLAY_SECONDS, SIGNAGE_MAX_DISPLAY_SECONDS, SIGNAGE_MIN_DISPLAY_SECONDS } from '@/lib/signage/content-display'
import { signageMediaPublicUrl, CIC_SUBMIT_URL, SIGNAGE_INDEFINITE_END_DATE, isIndefiniteEndDate } from '@/lib/signage/constants'
import { prepareSignageImageFile, captureVideoPoster, SIGNAGE_MAX_VIDEO_BYTES } from '@/lib/signage/client-image-upload'
import FilePickButton from '@/components/FilePickButton'
import SignageDateInput from '@/components/SignageDateInput'
import { dateRangeLifecycle as contentLifecycle, LIFECYCLE_META } from '@/lib/signage/lifecycle'

type ContentRow = {
  id: string
  type: string
  title: string | null
  media_path: string | null
  thumb_path: string | null
  html_body: string | null
  display_seconds: number
  status: string
  submitter_name: string | null
  submitter_email: string | null
  requested_note: string | null
  start_date: string
  end_date: string
  priority: number
  all_screens: boolean
  target_area_ids: string[]
  target_screen_ids: string[]
  target_buildings: string[]
  full_screen: boolean
  reject_reason: string | null
  system_kind: string | null
  created_at?: string
}

type Tab = 'pending' | 'approved' | 'rejected'

const CONTENT_COLUMNS =
  'id, type, title, media_path, thumb_path, html_body, display_seconds, status, submitter_name, submitter_email, requested_note, start_date, end_date, priority, all_screens, target_area_ids, target_screen_ids, target_buildings, full_screen, reject_reason, system_kind, created_at'

// Built-in "stock" blocks: always available, added + targeted like content.
const STOCK_BLOCKS: { kind: string; label: string; desc: string; available: boolean }[] = [
  { kind: 'broadcast_board', label: "What's coming up on air", desc: 'Upcoming livestreams & board meetings you feature, with date, time & a scan-to-watch QR.', available: true },
  { kind: 'calendar', label: 'Calendar', desc: 'A month/agenda view of upcoming productions and events.', available: false },
  { kind: 'website', label: 'Website preview', desc: 'A live snapshot of a district web page.', available: false },
]

const EMPTY_COUNTS: Record<Tab, number> = { pending: 0, approved: 0, rejected: 0 }

const TAB_LABELS: Record<Tab, string> = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }

function mediaFileName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || 'Media'
}

export default function SignageContentPage() {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const supabase = useMemo(() => createClient(), [])
  const { isManager, areas, screens, activeSiteId, sites } = useSignage()

  // Each location has its own submission form at /signage/<slug>/submit.
  const activeSite = sites.find(x => x.id === activeSiteId) || null
  const submitUrl = activeSite ? `https://www.csdtvstaff.org/signage/${activeSite.slug}/submit` : CIC_SUBMIT_URL

  const [tab, setTab] = useState<Tab>('pending')
  const [rows, setRows] = useState<ContentRow[]>([])
  const [counts, setCounts] = useState(EMPTY_COUNTS)
  const [countsLoaded, setCountsLoaded] = useState(false)
  const [showPast, setShowPast] = useState(false)
  const [showAI, setShowAI] = useState(false)
  const didInitTab = useRef(false)
  const [tabLoading, setTabLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, TargetingValue & {
    start_date: string
    end_date: string
    priority: number
    title: string
    full_screen: boolean
    display_seconds: number
    html_body: string
  }>>({})
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [fullPreview, setFullPreview] = useState<{ html?: string; img?: string; video?: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addFile, setAddFile] = useState<File | null>(null)
  const [addContentType, setAddContentType] = useState<'image' | 'video' | 'html'>('image')
  const [addHtmlBody, setAddHtmlBody] = useState('')
  const [addTargeting, setAddTargeting] = useState<TargetingValue>({ all_screens: true, target_area_ids: [], target_screen_ids: [] })
  const [addDates, setAddDates] = useState({
    title: '',
    start_date: '',
    end_date: '',
    priority: 0,
    display_seconds: SIGNAGE_DEFAULT_DISPLAY_SECONDS,
  })

  const loadCounts = useCallback(async () => {
    const { data } = await supabase.from('signage_content').select('status').eq('site_id', activeSiteId)
    const next = { ...EMPTY_COUNTS }
    for (const row of data ?? []) {
      const st = row.status as Tab
      if (st in next) next[st] += 1
    }
    setCounts(next)
    setCountsLoaded(true)
  }, [supabase, activeSiteId])

  const loadTab = useCallback(async (activeTab: Tab) => {
    setTabLoading(true)
    const { data } = await supabase
      .from('signage_content')
      .select(CONTENT_COLUMNS)
      .eq('status', activeTab)
      .eq('site_id', activeSiteId)
      .order('created_at', { ascending: false })
    const list = (data as ContentRow[]) || []
    setRows(list)
    setExpandedId(null) // master-detail: nothing selected on open (no auto-expanded card)
    setTabLoading(false)
  }, [supabase, activeSiteId])

  const refreshAll = useCallback(async () => {
    await Promise.all([loadCounts(), loadTab(tab)])
  }, [loadCounts, loadTab, tab])

  useEffect(() => { void loadCounts() }, [loadCounts])
  useEffect(() => { void loadTab(tab) }, [loadTab, tab])

  // Open on Pending only when something is waiting; otherwise open on Approved
  // so a clear queue lands on what's actually live. Runs once after counts load.
  useEffect(() => {
    if (didInitTab.current || !countsLoaded) return
    didInitTab.current = true
    if (counts.pending === 0) setTab('approved')
  }, [countsLoaded, counts.pending])

  const getEdit = (row: ContentRow) => edits[row.id] ?? {
    all_screens: row.all_screens,
    target_area_ids: row.target_area_ids ?? [],
    target_screen_ids: row.target_screen_ids ?? [],
    target_buildings: row.target_buildings ?? [],
    start_date: row.start_date?.slice(0, 10) ?? '',
    end_date: row.end_date?.slice(0, 10) ?? '',
    priority: row.priority,
    title: row.title ?? '',
    full_screen: row.full_screen,
    display_seconds: row.display_seconds ?? SIGNAGE_DEFAULT_DISPLAY_SECONDS,
    html_body: row.html_body ?? '',
  }

  const today = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  // Approved view: show current + upcoming first (soonest dates first, always-on
  // items last), and hide items whose end date has passed unless "Show past" is on.
  const displayRows = useMemo(() => {
    if (tab !== 'approved') return rows
    const withLc = rows.map(r => ({ r, lc: contentLifecycle(r.start_date, r.end_date, today) }))
    const visible = showPast ? withLc : withLc.filter(x => x.lc !== 'expired')
    visible.sort((a, b) => {
      const grp = (lc: typeof a.lc) => (lc === 'expired' ? 3 : lc === 'none' ? 2 : 0)
      const g = grp(a.lc) - grp(b.lc)
      if (g !== 0) return g
      const sa = a.r.start_date?.slice(0, 10) || '9999-99-99'
      const sb = b.r.start_date?.slice(0, 10) || '9999-99-99'
      return sa.localeCompare(sb)
    })
    return visible.map(x => x.r)
  }, [rows, tab, today, showPast])

  const saveEdit = async (row: ContentRow, extra?: Record<string, unknown>) => {
    const e = getEdit(row)
    await patchContent(row.id, {
      title: e.title,
      full_screen: e.full_screen,
      all_screens: e.all_screens,
      target_area_ids: e.target_area_ids,
      target_screen_ids: e.target_screen_ids,
      target_buildings: e.target_buildings ?? [],
      start_date: e.start_date,
      end_date: e.end_date,
      priority: e.priority,
      display_seconds: e.display_seconds,
      ...(row.type === 'html' ? { html_body: e.html_body } : {}),
      ...extra,
    })
  }

  const patchContent = async (id: string, body: Record<string, unknown>) => {
    setBusy(id)
    const res = await fetch(`/api/signage/content/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { toast(data.error || 'Update failed', 'error'); return false }
    toast('Updated', 'success')
    void refreshAll()
    return true
  }

  const approve = async (row: ContentRow) => {
    const e = getEdit(row)
    const targeting =
      !e.all_screens && e.target_area_ids.length === 0 && e.target_screen_ids.length === 0 && (e.target_buildings ?? []).length === 0
        ? { ...e, all_screens: true }
        : e
    await patchContent(row.id, {
      status: 'approved',
      title: targeting.title,
      full_screen: targeting.full_screen,
      all_screens: targeting.all_screens,
      target_area_ids: targeting.target_area_ids,
      target_screen_ids: targeting.target_screen_ids,
      target_buildings: targeting.target_buildings ?? [],
      start_date: targeting.start_date,
      end_date: targeting.end_date,
      priority: targeting.priority,
      display_seconds: targeting.display_seconds,
      ...(row.type === 'html' ? { html_body: targeting.html_body } : {}),
    })
  }

  const reject = async (row: ContentRow) => {
    if (!rejectReason.trim()) { toast('Enter a reject reason', 'error'); return }
    const ok = await patchContent(row.id, { status: 'rejected', reject_reason: rejectReason.trim() })
    if (ok) { setRejectId(null); setRejectReason('') }
  }

  const addDirect = async () => {
    const needsFile = addContentType !== 'html'
    if ((needsFile && !addFile) || !addDates.start_date || !addDates.end_date) {
      toast(needsFile ? 'File and dates required' : 'Dates and HTML required', 'error')
      return
    }
    if (addContentType === 'html' && !addHtmlBody.trim()) {
      toast('Enter HTML content', 'error')
      return
    }
    if (
      !addTargeting.all_screens &&
      addTargeting.target_area_ids.length === 0 &&
      addTargeting.target_screen_ids.length === 0 &&
      (addTargeting.target_buildings ?? []).length === 0
    ) {
      toast('Select "All screens" or at least one area, building, or screen', 'error')
      return
    }

    const fd = new FormData()
    fd.set('title', addDates.title)
    fd.set('start_date', addDates.start_date)
    fd.set('end_date', addDates.end_date)
    fd.set('priority', String(addDates.priority))
    fd.set('display_seconds', String(addDates.display_seconds))
    fd.set('content_type', addContentType)
    fd.set('site_id', activeSiteId)
    fd.set('all_screens', String(addTargeting.all_screens))
    fd.set('target_area_ids', JSON.stringify(addTargeting.target_area_ids))
    fd.set('target_screen_ids', JSON.stringify(addTargeting.target_screen_ids))
    fd.set('target_buildings', JSON.stringify(addTargeting.target_buildings ?? []))

    if (addContentType === 'html') {
      fd.set('html_body', addHtmlBody)
    } else if (addContentType !== 'video') {
      // Image: compress in-browser, then send through the API route (small).
      let uploadFile: File
      try {
        uploadFile = await prepareSignageImageFile(addFile!)
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not prepare file for upload', 'error')
        return
      }
      fd.set('image', uploadFile)
    }

    setBusy('add')

    if (addContentType === 'video') {
      // Videos upload DIRECTLY to storage via a signed URL, so they aren't
      // bound by the serverless ~4.5 MB request-body cap.
      const file = addFile!
      const isMp4 = file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.mp4')
      if (!isMp4) { setBusy(null); toast('Video must be an MP4 file.', 'error'); return }
      if (file.size > SIGNAGE_MAX_VIDEO_BYTES) { setBusy(null); toast('Video must be 200 MB or smaller.', 'error'); return }
      try {
        // 1. Signed upload URLs for the video + its poster thumbnail.
        const signRes = await fetch('/api/signage/content/sign-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mime: 'video/mp4', size_bytes: file.size, filename: file.name }),
        })
        const sign = await signRes.json().catch(() => ({}))
        if (!signRes.ok) { setBusy(null); toast(sign.error || 'Could not start upload', 'error'); return }

        // 2. Upload the video file straight to storage.
        const up = await supabase.storage.from(sign.bucket).uploadToSignedUrl(sign.video.path, sign.video.token, file, { contentType: 'video/mp4' })
        if (up.error) { setBusy(null); toast(`Upload failed: ${up.error.message}`, 'error'); return }

        // 3. Capture + upload a poster frame for the thumbnail (best-effort).
        let thumbPath: string | null = null
        if (sign.thumb) {
          const poster = await captureVideoPoster(file)
          if (poster) {
            const upThumb = await supabase.storage.from(sign.bucket).uploadToSignedUrl(sign.thumb.path, sign.thumb.token, poster, { contentType: 'image/jpeg' })
            if (!upThumb.error) thumbPath = sign.thumb.path
          }
        }

        // 4. Record the content row pointing at the uploaded objects.
        const finRes = await fetch('/api/signage/content/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: addDates.title,
            start_date: addDates.start_date,
            end_date: addDates.end_date,
            priority: addDates.priority,
            display_seconds: addDates.display_seconds,
            site_id: activeSiteId,
            all_screens: addTargeting.all_screens,
            target_area_ids: addTargeting.target_area_ids,
            target_screen_ids: addTargeting.target_screen_ids,
            target_buildings: addTargeting.target_buildings ?? [],
            media_path: sign.video.path,
            thumb_path: thumbPath,
          }),
        })
        const fin = await finRes.json().catch(() => ({}))
        setBusy(null)
        if (!finRes.ok) { toast(fin.error || 'Could not save video', 'error'); return }
      } catch (e) {
        setBusy(null)
        toast(e instanceof Error ? e.message : 'Video upload failed', 'error')
        return
      }
    } else {
      const res = await fetch('/api/signage/content', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      setBusy(null)
      if (!res.ok) {
        toast(typeof data.error === 'string' ? data.error : `Upload failed (${res.status})`, 'error')
        return
      }
    }

    toast('Content added', 'success')
    setShowAdd(false)
    setAddFile(null)
    setAddContentType('image')
    setAddHtmlBody('')
    setAddTargeting({ all_screens: true, target_area_ids: [], target_screen_ids: [] })
    setAddDates({ title: '', start_date: '', end_date: '', priority: 0, display_seconds: SIGNAGE_DEFAULT_DISPLAY_SECONDS })
    void refreshAll()
  }

  const submitterLine = (row: ContentRow) => {
    const parts: string[] = []
    if (row.submitter_name) parts.push(row.submitter_name)
    if (row.submitter_email) parts.push(row.submitter_email)
    if (row.created_at) parts.push(`submitted ${formatSignageDate(row.created_at)}`)
    return parts.join(' · ')
  }

  const addStockBlock = async (kind: string) => {
    // If this stock block already exists for the site, just open it to assign screens.
    const { data: existing } = await supabase
      .from('signage_content').select('id, status')
      .eq('site_id', activeSiteId).eq('system_kind', kind).limit(1).maybeSingle()
    if (existing) {
      setTab(existing.status === 'rejected' ? 'rejected' : existing.status === 'pending' ? 'pending' : 'approved')
      setExpandedId(existing.id)
      toast('Already added — assign it to screens below', 'success')
      return
    }
    const fd = new FormData()
    fd.set('system_kind', kind)
    fd.set('title', STOCK_BLOCKS.find(b => b.kind === kind)?.label || 'Stock content')
    fd.set('start_date', today)
    fd.set('end_date', SIGNAGE_INDEFINITE_END_DATE)
    fd.set('all_screens', 'false')
    fd.set('target_area_ids', '[]')
    fd.set('target_screen_ids', '[]')
    fd.set('target_buildings', '[]')
    fd.set('site_id', activeSiteId)
    fd.set('status', 'approved')
    const res = await fetch('/api/signage/content', { method: 'POST', body: fd })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast(data.error || 'Could not add block', 'error'); return }
    toast('Added — now choose which screens show it', 'success')
    await refreshAll()
    setTab('approved')
    if (data.content?.id) setExpandedId(data.content.id)
  }

  const requestLine = (row: ContentRow) => {
    const parts: string[] = []
    if (row.start_date && row.end_date) {
      parts.push(isIndefiniteEndDate(row.end_date)
        ? `Requested from ${formatSignageDate(row.start_date)} · no end date`
        : `Requested ${formatSignageDate(row.start_date)}–${formatSignageDate(row.end_date)}`)
    }
    if (row.requested_note) parts.push(row.requested_note)
    return parts.join(' · ')
  }

  return (
    <SignagePageShell title="Content" subtitle="Images, videos & slides on the screens">
      {showAI && <CreateWithAI onClose={() => setShowAI(false)} onSaved={() => { void refreshAll() }} />}
      <div style={{ ...s.card, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: s.text }}>Share the submission link</div>
          <div style={{ fontSize: 12, color: s.muted, marginTop: 2 }}>Send this to anyone who needs to submit content for {activeSite?.name || 'these'} screens. Everything goes to the approval queue.</div>
          <div style={{ fontSize: 12.5, color: s.text, marginTop: 6, wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace' }}>{submitUrl}</div>
        </div>
        <button type="button" onClick={() => { void navigator.clipboard.writeText(submitUrl); toast('Submission link copied', 'success') }} style={s.btnPrimary}>Copy link</button>
        <a href={submitUrl} target="_blank" rel="noopener noreferrer" style={{ ...s.btn, textDecoration: 'none' }}>Open form</a>
      </div>

      {isManager && (
        <div style={{ ...s.card, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: s.text }}>Stock content</div>
          <div style={{ fontSize: 12, color: s.muted, margin: '2px 0 12px' }}>Built-in blocks that are always available. Add one, then choose which screens show it.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {STOCK_BLOCKS.map(b => (
              <div key={b.kind} style={{ border: `1px solid ${s.border}`, borderRadius: 10, padding: '11px 13px', display: 'flex', flexDirection: 'column', opacity: b.available ? 1 : 0.6 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: s.text }}>{b.label}</div>
                <div style={{ fontSize: 11.5, color: s.muted, margin: '3px 0 10px', lineHeight: 1.45, flex: 1 }}>{b.desc}</div>
                {b.available
                  ? <button type="button" onClick={() => void addStockBlock(b.kind)} style={{ ...s.btnPrimary, alignSelf: 'flex-start' }}>Add to screens</button>
                  : <span style={{ fontSize: 11, fontWeight: 600, color: s.muted, alignSelf: 'flex-start' }}>Coming soon</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['pending', 'approved', 'rejected'] as Tab[]).map(t => (
          <button key={t} type="button" onClick={() => setTab(t)} style={s.seg(tab === t)}>
            {TAB_LABELS[t]} <b style={{ fontWeight: 600 }}>{counts[t]}</b>
          </button>
        ))}
        {tab === 'approved' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: s.muted, cursor: 'pointer' }}>
            <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} />
            Show past
          </label>
        )}
        {isManager && (
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button type="button" onClick={() => setShowAI(true)} style={{ ...s.btn, fontWeight: 500 }}>✨ Create with AI</button>
            <button type="button" onClick={() => setShowAdd(v => !v)} style={s.btnPrimary}>
              {showAdd ? 'Cancel add' : '+ Add content'}
            </button>
          </div>
        )}
      </div>

      {showAdd && isManager && (
        <div style={{ ...s.card, marginBottom: 20 }}>
          <h3 style={s.h3}>Direct upload (approved)</h3>
          <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
            <div>
              <p style={s.lbl}>Title</p>
              <input value={addDates.title} onChange={e => setAddDates(d => ({ ...d, title: e.target.value }))} style={s.input} />
            </div>
            <div style={s.row}>
              <div style={{ flex: 1, minWidth: 130 }}>
                <p style={s.lbl}>Start date</p>
                <SignageDateInput value={addDates.start_date} defaultToToday colorScheme={s.dark ? 'dark' : 'light'} onChange={v => setAddDates(d => ({ ...d, start_date: v }))} style={s.input} />
              </div>
              <div style={{ flex: 1, minWidth: 130 }}>
                <p style={s.lbl}>End date</p>
                {isIndefiniteEndDate(addDates.end_date) ? (
                  <div style={{ ...s.input, display: 'flex', alignItems: 'center', color: s.muted }}>No end date</div>
                ) : (
                  <SignageDateInput value={addDates.end_date} colorScheme={s.dark ? 'dark' : 'light'} onChange={v => setAddDates(d => ({ ...d, end_date: v }))} style={s.input} min={addDates.start_date || undefined} />
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: s.muted, marginTop: 5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={isIndefiniteEndDate(addDates.end_date)} onChange={e => setAddDates(d => ({ ...d, end_date: e.target.checked ? SIGNAGE_INDEFINITE_END_DATE : '' }))} />
                  No end date (runs indefinitely)
                </label>
              </div>
              <div style={{ width: 90 }}>
                <p style={s.lbl}>Priority</p>
                <input type="number" value={addDates.priority} onChange={e => setAddDates(d => ({ ...d, priority: parseInt(e.target.value, 10) || 0 }))} style={s.input} />
              </div>
              <div style={{ width: 110 }}>
                <p style={s.lbl}>Show for (sec)</p>
                <input
                  type="number"
                  min={SIGNAGE_MIN_DISPLAY_SECONDS}
                  max={SIGNAGE_MAX_DISPLAY_SECONDS}
                  value={addDates.display_seconds}
                  onChange={e => setAddDates(d => ({ ...d, display_seconds: parseInt(e.target.value, 10) || SIGNAGE_DEFAULT_DISPLAY_SECONDS }))}
                  style={s.input}
                />
              </div>
            </div>
            <div>
              <p style={s.lbl}>Content type</p>
              <select value={addContentType} onChange={e => setAddContentType(e.target.value as 'image' | 'video' | 'html')} style={s.input}>
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="html">HTML</option>
              </select>
            </div>
            <SignageTargetingPicker areas={areas} screens={screens} value={addTargeting} onChange={setAddTargeting} lbl={s.lbl} />
            {addContentType === 'html' ? (
              <>
                <p style={s.lbl}>HTML</p>
                <textarea
                  value={addHtmlBody}
                  onChange={e => setAddHtmlBody(e.target.value)}
                  rows={8}
                  placeholder="<h2>Welcome</h2><p>Your message here</p>"
                  style={s.textarea}
                />
                <p style={{ ...s.lbl, margin: 0, lineHeight: 1.45 }}>
                  Basic HTML for a custom slide. Script tags are stripped automatically.
                </p>
              </>
            ) : (
              <>
                <FilePickButton accept="image/png,image/jpeg,image/jpg,image/webp,video/mp4" label="Choose file" changeLabel="Change file" onChange={setAddFile} />
                <p style={{ ...s.lbl, margin: 0, lineHeight: 1.45 }}>
                  {addContentType === 'video'
                    ? 'MP4 video, up to 200 MB. Uploaded directly to storage; a thumbnail is captured automatically. Use H.264 for best playback on TV sticks.'
                    : 'JPG, PNG, or WebP. Large photos are compressed automatically (max 4 MB).'}
                </p>
              </>
            )}
            <button type="button" disabled={busy === 'add'} onClick={() => void addDirect()} style={s.btnPrimary}>Upload & publish</button>
          </div>
        </div>
      )}

      {tabLoading ? (
        <div style={{ color: s.muted, padding: 24, textAlign: 'center' }}>Loading…</div>
      ) : !displayRows.length ? (
        <div style={{ color: s.muted, padding: 24, textAlign: 'center' }}>No {tab} items.</div>
      ) : (
        <div className={`sig-content-split${expandedId ? ' is-open' : ''}`}>
          <div className="sig-content-tiles">
            {displayRows.map(row => {
              const e = getEdit(row)
              const lc = contentLifecycle(row.start_date, row.end_date, today)
              const showStatus = tab === 'approved' && lc !== 'none'
              const selected = expandedId === row.id
              const fileName = row.media_path ? mediaFileName(row.media_path) : 'HTML slide'
              const typeChip = row.type === 'html' ? 'HTML' : row.type === 'video' ? 'Video' : 'Image'
              const dateLine = row.start_date
                ? isIndefiniteEndDate(row.end_date)
                  ? `From ${formatSignageDate(row.start_date)} · no end date`
                  : `${formatSignageDate(row.start_date)}–${formatSignageDate(row.end_date)}`
                : 'No dates'
              return (
                <div
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  onClick={() => setExpandedId(selected ? null : row.id)}
                  onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setExpandedId(selected ? null : row.id) } }}
                  style={{
                    ...s.card,
                    marginTop: 0,
                    padding: 0,
                    overflow: 'hidden',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    ...(selected ? { border: '2px solid #2a7fb8' } : {}),
                  }}
                >
                  <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#0a1f3c', overflow: 'hidden' }}>
                    <SlidePreview row={row} />
                    {showStatus && (
                      <span style={{ position: 'absolute', top: 6, left: 6, fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 20, color: '#fff', background: LIFECYCLE_META[lc].color }}>{LIFECYCLE_META[lc].label}</span>
                    )}
                    <span style={{ position: 'absolute', top: 6, right: 6, fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 5, color: '#fff', background: 'rgba(0,0,0,0.55)' }}>{typeChip}</span>
                  </div>
                  <div style={{ padding: '8px 10px' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: s.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title || fileName}</div>
                    <div style={{ fontSize: 11.5, color: s.muted, marginTop: 2 }}>{dateLine}</div>
                  </div>
                </div>
              )
            })}
          </div>

          {expandedId && <div className="sig-content-detail">
            {(() => {
              const row = displayRows.find(r => r.id === expandedId)
              if (!row) {
                return (
                  <div style={{ ...s.card, color: s.muted, textAlign: 'center', padding: 28 }}>
                    Select a piece of content to edit.
                  </div>
                )
              }
              const e = getEdit(row)
              const lc = contentLifecycle(row.start_date, row.end_date, today)
              const showStatus = tab === 'approved' && lc !== 'none'
              const isHtml = row.type === 'html' && !row.system_kind
              const isVideoRow = row.type === 'video'
              const previewImg = !isHtml && row.thumb_path
                ? signageMediaPublicUrl(row.thumb_path)
                : (!isHtml && !isVideoRow && row.media_path ? signageMediaPublicUrl(row.media_path) : null)
              const previewVideo = isVideoRow && row.media_path
                ? `${signageMediaPublicUrl(row.media_path)}#t=0.5`
                : null
              return (
                <div style={{ ...s.card, borderLeft: showStatus ? `4px solid ${LIFECYCLE_META[lc].color}` : undefined }}>
                  <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#0a1f3c', borderRadius: 10, overflow: 'hidden', marginBottom: 10 }}>
                    <SlidePreview row={row} edit={isHtml ? { html_body: e.html_body } : undefined} fit="contain" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <button
                      type="button"
                      onClick={() => setFullPreview(isHtml ? { html: e.html_body } : previewImg ? { img: previewImg } : previewVideo ? { video: previewVideo } : null)}
                      style={{ ...s.btn, padding: '4px 10px', fontSize: 12 }}
                    >
                      ⛶ Full preview
                    </button>
                    {showStatus && (
                      <span style={{ fontSize: 10.5, fontWeight: 600, padding: '1px 8px', borderRadius: 20, color: LIFECYCLE_META[lc].color, background: LIFECYCLE_META[lc].bg }}>{LIFECYCLE_META[lc].label}</span>
                    )}
                  </div>
                  <input
                    value={e.title}
                    onChange={ev => setEdits(prev => ({ ...prev, [row.id]: { ...e, title: ev.target.value } }))}
                    placeholder="Title"
                    style={{ ...s.input, fontWeight: 500, fontSize: 15, marginBottom: 4 }}
                  />
                  {submitterLine(row) && (
                    <div style={{ fontSize: 12, color: s.muted, marginTop: 2 }}>{submitterLine(row)}</div>
                  )}
                  {requestLine(row) && (
                    <div style={{ fontSize: 12, color: s.muted, marginTop: 2 }}>{requestLine(row)}</div>
                  )}

                  <div style={s.divider}>
                    <SignageTargetingPicker
                      areas={areas}
                      screens={screens}
                      value={e}
                      onChange={v => setEdits(prev => ({ ...prev, [row.id]: { ...e, ...v } }))}
                      lbl={s.lbl}
                    />
                    <div style={{ ...s.row, marginTop: 12 }}>
                      <div style={{ flex: 1, minWidth: 130 }}>
                        <p style={s.lbl}>Start date</p>
                        <SignageDateInput value={e.start_date} defaultToToday colorScheme={s.dark ? 'dark' : 'light'} onChange={v => setEdits(prev => ({ ...prev, [row.id]: { ...e, start_date: v } }))} style={s.input} />
                      </div>
                      <div style={{ flex: 1, minWidth: 130 }}>
                        <p style={s.lbl}>End date</p>
                        {isIndefiniteEndDate(e.end_date) ? (
                          <div style={{ ...s.input, display: 'flex', alignItems: 'center', color: s.muted }}>No end date</div>
                        ) : (
                          <SignageDateInput value={e.end_date} colorScheme={s.dark ? 'dark' : 'light'} onChange={v => setEdits(prev => ({ ...prev, [row.id]: { ...e, end_date: v } }))} style={s.input} min={e.start_date || undefined} />
                        )}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: s.muted, marginTop: 5, cursor: 'pointer' }}>
                          <input type="checkbox" checked={isIndefiniteEndDate(e.end_date)} onChange={ev => setEdits(prev => ({ ...prev, [row.id]: { ...e, end_date: ev.target.checked ? SIGNAGE_INDEFINITE_END_DATE : '' } }))} />
                          No end date (runs indefinitely)
                        </label>
                      </div>
                      <div style={{ width: 90 }}>
                        <p style={s.lbl}>Priority</p>
                        <input type="number" value={e.priority} onChange={ev => setEdits(prev => ({ ...prev, [row.id]: { ...e, priority: parseInt(ev.target.value, 10) || 0 } }))} style={s.input} />
                      </div>
                      <div style={{ width: 110 }}>
                        <p style={s.lbl}>Show for (sec)</p>
                        <input
                          type="number"
                          min={SIGNAGE_MIN_DISPLAY_SECONDS}
                          max={SIGNAGE_MAX_DISPLAY_SECONDS}
                          value={e.display_seconds}
                          onChange={ev => setEdits(prev => ({ ...prev, [row.id]: { ...e, display_seconds: parseInt(ev.target.value, 10) || SIGNAGE_DEFAULT_DISPLAY_SECONDS } }))}
                          style={s.input}
                        />
                      </div>
                    </div>
                    {isHtml && (
                      <div style={{ marginTop: 12 }}>
                        <p style={s.lbl}>HTML</p>
                        <textarea
                          value={e.html_body}
                          onChange={ev => setEdits(prev => ({ ...prev, [row.id]: { ...e, html_body: ev.target.value } }))}
                          rows={8}
                          style={s.textarea}
                        />
                      </div>
                    )}
                    <label style={{ display: 'flex', gap: 7, marginTop: 12, fontSize: 13, color: s.text, alignItems: 'center' }}>
                      <input type="checkbox" checked={e.full_screen} onChange={ev => setEdits(prev => ({ ...prev, [row.id]: { ...e, full_screen: ev.target.checked } }))} />
                      Full-screen takeover
                    </label>

                    {tab === 'pending' && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                        <button type="button" onClick={() => { setRejectId(row.id); setRejectReason('') }} style={s.btn}>Reject</button>
                        <button type="button" disabled={busy === row.id} onClick={() => void approve(row)} style={s.btnPrimary}>✓ Approve</button>
                      </div>
                    )}
                    {tab === 'approved' && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                        <button type="button" disabled={busy === row.id} onClick={() => void saveEdit(row)} style={s.btnPrimary}>Save changes</button>
                      </div>
                    )}
                    {tab === 'rejected' && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                        <button type="button" disabled={busy === row.id} onClick={() => void saveEdit(row)} style={s.btn}>Save changes</button>
                        <button type="button" disabled={busy === row.id} onClick={() => void saveEdit(row, { status: 'approved', reject_reason: null })} style={s.btnPrimary}>Re-approve</button>
                      </div>
                    )}

                    {rejectId === row.id && (
                      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                        <input value={rejectReason} onChange={ev => setRejectReason(ev.target.value)} placeholder="Reject reason" style={{ ...s.input, flex: 1 }} />
                        <button type="button" onClick={() => void reject(row)} style={s.btn}>Confirm reject</button>
                      </div>
                    )}

                    {row.reject_reason && tab === 'rejected' && (
                      <div style={{ marginTop: 8, color: '#ef4444', fontSize: 13 }}>{row.reject_reason}</div>
                    )}

                    {isManager && tab !== 'pending' && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!(await confirmDialog({ message: 'Delete this content?', tone: 'danger' }))) return
                          await fetch(`/api/signage/content/${row.id}`, { method: 'DELETE' })
                          setExpandedId(null)
                          void refreshAll()
                        }}
                        style={{ ...s.btn, marginTop: 12, color: '#ef4444', borderColor: '#ef4444' }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>}
        </div>
      )}

      {fullPreview && (
        <div
          onClick={() => setFullPreview(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(2,8,18,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div onClick={ev => ev.stopPropagation()} style={{ width: 'min(92vw, 1280px)', aspectRatio: '16 / 9', background: '#0a1f3c', borderRadius: 12, overflow: 'hidden', position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            {fullPreview.html != null ? (
              <ScaledSlide html={fullPreview.html} />
            ) : fullPreview.img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fullPreview.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : fullPreview.video ? (
              <video src={fullPreview.video} controls autoPlay style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : null}
          </div>
          <button type="button" onClick={() => setFullPreview(null)} style={{ position: 'fixed', top: 20, right: 24, fontSize: 26, color: '#fff', background: 'transparent', border: 'none', cursor: 'pointer' }} aria-label="Close preview">×</button>
        </div>
      )}

      <style>{`
        .sig-content-split { display: grid; grid-template-columns: 1fr; gap: 16px; }
        .sig-content-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 280px)); gap: 14px; align-content: start; justify-content: start; }
        @media (min-width: 860px) {
          .sig-content-split.is-open { grid-template-columns: minmax(0, 1fr) 380px; align-items: start; }
          .sig-content-detail { position: sticky; top: 80px; }
        }
      `}</style>
    </SignagePageShell>
  )
}

/**
 * Render a slide's HTML at its true 1920x1080 canvas, then CSS-scale it down to
 * fit the container. This makes the slide look exactly like it does on a real
 * screen — instead of letting its vh/vw units reflow to a tiny iframe viewport.
 * The parent must be position:relative with a 16:9 aspect ratio.
 */
function ScaledSlide({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setScale(el.clientWidth / 1920)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#0a1f3c' }}>
      <iframe
        title=""
        srcDoc={html}
        sandbox="allow-scripts"
        scrolling="no"
        style={{ width: 1920, height: 1080, border: 0, pointerEvents: 'none', transformOrigin: 'top left', transform: `scale(${scale})` }}
      />
    </div>
  )
}

/**
 * Live preview of a content item. HTML slides render in a sandboxed iframe (the
 * real slide, scaled to the box — generated slides use vmin/vh/vw so they fit any
 * size). Images/videos show their thumbnail. `fit` is cover for tiles, contain
 * for the detail panel. The parent must be position:relative with a fixed aspect.
 */
function SlidePreview({ row, edit, fit = 'cover' }: { row: ContentRow; edit?: { html_body: string }; fit?: 'cover' | 'contain' }) {
  if (row.system_kind) {
    const label = STOCK_BLOCKS.find(b => b.kind === row.system_kind)?.label || 'Live block'
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: '#0b0e13', textAlign: 'center', padding: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#ff5760' }}>Stock block</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#f0f4ff' }}>{label}</span>
        <span style={{ fontSize: 10.5, color: '#8a99b5' }}>Rendered live on screens</span>
      </div>
    )
  }
  const isHtml = row.type === 'html'
  const isVideo = row.type === 'video'
  const html = (edit?.html_body ?? row.html_body ?? '').trim()
  // Debounce the doc so the iframe doesn't reload on every keystroke while editing.
  const [docHtml, setDocHtml] = useState(html)
  useEffect(() => {
    const t = setTimeout(() => setDocHtml(html), 350)
    return () => clearTimeout(t)
  }, [html])
  const thumb = !isHtml && row.thumb_path ? signageMediaPublicUrl(row.thumb_path) : null
  const img = !isHtml && !isVideo && row.media_path ? signageMediaPublicUrl(row.media_path) : null
  const posterVideo = isVideo && row.media_path ? `${signageMediaPublicUrl(row.media_path)}#t=0.5` : null
  const fill = { position: 'absolute' as const, inset: 0, width: '100%', height: '100%' }
  const placeholder = { ...fill, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9fb3cf', fontSize: 12, fontWeight: 600, letterSpacing: 1 }

  if (isHtml) {
    if (!docHtml) return <div style={placeholder}>HTML slide</div>
    return <ScaledSlide html={docHtml} />
  }
  if (thumb || img) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={(thumb || img) as string} alt="" style={{ ...fill, objectFit: fit }} />
  }
  if (posterVideo) {
    return <video src={posterVideo} muted playsInline preload="metadata" style={{ ...fill, objectFit: fit }} />
  }
  return <div style={placeholder}>No preview</div>
}
