'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { SIGNAGE_DEFAULT_DISPLAY_SECONDS, SIGNAGE_MAX_DISPLAY_SECONDS, SIGNAGE_MIN_DISPLAY_SECONDS } from '@/lib/signage/content-display'
import { signageMediaPublicUrl, CIC_SUBMIT_URL } from '@/lib/signage/constants'
import { prepareSignageImageFile, captureVideoPoster, SIGNAGE_MAX_VIDEO_BYTES } from '@/lib/signage/client-image-upload'
import FilePickButton from '@/components/FilePickButton'
import SignageDateInput from '@/components/SignageDateInput'
import { dateRangeLifecycle as contentLifecycle, LIFECYCLE_META, LIFECYCLE_RANK } from '@/lib/signage/lifecycle'

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
  full_screen: boolean
  reject_reason: string | null
  created_at?: string
}

type Tab = 'pending' | 'approved' | 'rejected'

const CONTENT_COLUMNS =
  'id, type, title, media_path, thumb_path, html_body, display_seconds, status, submitter_name, submitter_email, requested_note, start_date, end_date, priority, all_screens, target_area_ids, target_screen_ids, full_screen, reject_reason, created_at'

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
  const { isManager, areas, screens, activeSiteId } = useSignage()

  const [tab, setTab] = useState<Tab>('pending')
  const [rows, setRows] = useState<ContentRow[]>([])
  const [counts, setCounts] = useState(EMPTY_COUNTS)
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
    setExpandedId(list[0]?.id ?? null)
    setTabLoading(false)
  }, [supabase, activeSiteId])

  const refreshAll = useCallback(async () => {
    await Promise.all([loadCounts(), loadTab(tab)])
  }, [loadCounts, loadTab, tab])

  useEffect(() => { void loadCounts() }, [loadCounts])
  useEffect(() => { void loadTab(tab) }, [loadTab, tab])

  const getEdit = (row: ContentRow) => edits[row.id] ?? {
    all_screens: row.all_screens,
    target_area_ids: row.target_area_ids ?? [],
    target_screen_ids: row.target_screen_ids ?? [],
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
  const displayRows = useMemo(() =>
    tab === 'approved'
      ? [...rows].sort((a, b) =>
          LIFECYCLE_RANK[contentLifecycle(a.start_date, a.end_date, today)] -
          LIFECYCLE_RANK[contentLifecycle(b.start_date, b.end_date, today)])
      : rows
  , [rows, tab, today])

  const saveEdit = async (row: ContentRow, extra?: Record<string, unknown>) => {
    const e = getEdit(row)
    await patchContent(row.id, {
      title: e.title,
      full_screen: e.full_screen,
      all_screens: e.all_screens,
      target_area_ids: e.target_area_ids,
      target_screen_ids: e.target_screen_ids,
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
      !e.all_screens && e.target_area_ids.length === 0 && e.target_screen_ids.length === 0
        ? { ...e, all_screens: true }
        : e
    await patchContent(row.id, {
      status: 'approved',
      title: targeting.title,
      full_screen: targeting.full_screen,
      all_screens: targeting.all_screens,
      target_area_ids: targeting.target_area_ids,
      target_screen_ids: targeting.target_screen_ids,
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
      addTargeting.target_screen_ids.length === 0
    ) {
      toast('Select "All screens" or at least one area/screen', 'error')
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

  const requestLine = (row: ContentRow) => {
    const parts: string[] = []
    if (row.start_date && row.end_date) {
      parts.push(`Requested ${formatSignageDate(row.start_date)}–${formatSignageDate(row.end_date)}`)
    }
    if (row.requested_note) parts.push(row.requested_note)
    return parts.join(' · ')
  }

  return (
    <SignagePageShell title="Content" subtitle="Images, videos & slides on the screens">
      <div style={{ ...s.card, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: s.text }}>Share the submission link</div>
          <div style={{ fontSize: 12, color: s.muted, marginTop: 2 }}>Send this to anyone who needs to submit content for the CIC screens. It goes to the approval queue.</div>
          <div style={{ fontSize: 12.5, color: s.text, marginTop: 6, wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace' }}>{CIC_SUBMIT_URL}</div>
        </div>
        <button type="button" onClick={() => { void navigator.clipboard.writeText(CIC_SUBMIT_URL); toast('Submission link copied', 'success') }} style={s.btnPrimary}>Copy link</button>
        <a href={CIC_SUBMIT_URL} target="_blank" rel="noopener noreferrer" style={{ ...s.btn, textDecoration: 'none' }}>Open form</a>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['pending', 'approved', 'rejected'] as Tab[]).map(t => (
          <button key={t} type="button" onClick={() => setTab(t)} style={s.seg(tab === t)}>
            {TAB_LABELS[t]} <b style={{ fontWeight: 600 }}>{counts[t]}</b>
          </button>
        ))}
        {isManager && (
          <button type="button" onClick={() => setShowAdd(v => !v)} style={{ ...s.btnPrimary, marginLeft: 'auto' }}>
            {showAdd ? 'Cancel add' : '+ Add content'}
          </button>
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
                <SignageDateInput value={addDates.end_date} colorScheme={s.dark ? 'dark' : 'light'} onChange={v => setAddDates(d => ({ ...d, end_date: v }))} style={s.input} min={addDates.start_date || undefined} />
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
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {displayRows.map(row => {
            const e = getEdit(row)
            const lc = contentLifecycle(row.start_date, row.end_date, today)
            const showStatus = tab === 'approved' && lc !== 'none'
            const expanded = expandedId === row.id
            const isHtml = row.type === 'html'
            const isVideoRow = row.type === 'video'
            // Prefer a real thumbnail; fall back to the image itself, or a video
            // poster frame (#t hint) for videos uploaded without a thumbnail.
            const previewImg = !isHtml && row.thumb_path
              ? signageMediaPublicUrl(row.thumb_path)
              : (!isHtml && !isVideoRow && row.media_path ? signageMediaPublicUrl(row.media_path) : null)
            const previewVideo = isVideoRow && !row.thumb_path && row.media_path
              ? `${signageMediaPublicUrl(row.media_path)}#t=0.5`
              : null
            const fileName = row.media_path ? mediaFileName(row.media_path) : 'HTML slide'

            if (!expanded) {
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setExpandedId(row.id)}
                  style={{
                    ...s.card,
                    marginTop: 0,
                    borderLeft: showStatus ? `4px solid ${LIFECYCLE_META[lc].color}` : undefined,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    textAlign: 'left',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  <div style={{ ...s.thumb, width: 64, height: 40 }}>
                    {previewImg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                    ) : previewVideo ? (
                      <video src={previewVideo} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{isHtml ? 'HTML' : 'VIDEO'}</span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {showStatus && (
                      <span style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 600, padding: '1px 8px', borderRadius: 20, marginBottom: 3, color: LIFECYCLE_META[lc].color, background: LIFECYCLE_META[lc].bg }}>{LIFECYCLE_META[lc].label}</span>
                    )}
                    <div style={{ fontSize: 14, fontWeight: 500, color: s.text }}>{e.title || fileName}</div>
                    <div style={{ fontSize: 12, color: s.muted, marginTop: 2 }}>{submitterLine(row)}</div>
                  </div>
                  <span style={{ fontSize: 18, color: '#9aa0ab' }}>▾</span>
                </button>
              )
            }

            return (
              <div key={row.id} style={{ ...s.card, borderLeft: showStatus ? `4px solid ${LIFECYCLE_META[lc].color}` : undefined }}>
                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{ ...s.thumb, width: 150, height: 84, overflow: 'hidden', padding: isHtml ? 8 : 0 }}>
                    {previewImg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                    ) : previewVideo ? (
                      <video src={previewVideo} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                    ) : (
                      <div style={{ fontSize: 11, color: s.muted, overflow: 'hidden', height: '100%' }}>
                        {e.html_body.slice(0, 120) || 'HTML slide'}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {showStatus && (
                      <span style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 600, padding: '1px 8px', borderRadius: 20, marginBottom: 4, color: LIFECYCLE_META[lc].color, background: LIFECYCLE_META[lc].bg }}>{LIFECYCLE_META[lc].label}</span>
                    )}
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
                  </div>
                  {rows.length > 1 && (
                    <button type="button" onClick={() => setExpandedId(null)} style={{ ...s.btn, alignSelf: 'flex-start', padding: '4px 8px' }} aria-label="Collapse">
                      ▴
                    </button>
                  )}
                </div>

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
                      <SignageDateInput value={e.end_date} colorScheme={s.dark ? 'dark' : 'light'} onChange={v => setEdits(prev => ({ ...prev, [row.id]: { ...e, end_date: v } }))} style={s.input} min={e.start_date || undefined} />
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
          })}
          {!rows.length && <div style={{ color: s.muted, padding: 24, textAlign: 'center' }}>No {tab} items.</div>}
        </div>
      )}
    </SignagePageShell>
  )
}
