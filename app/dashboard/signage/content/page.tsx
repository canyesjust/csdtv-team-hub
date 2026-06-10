'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import SignageTargetingPicker, { SignagePageShell, useSignageTheme, type TargetingValue } from '../components/SignageAdmin'
import { useSignage } from '../components/SignageProvider'
import { signageMediaPublicUrl } from '@/lib/signage/constants'
import FilePickButton from '@/components/FilePickButton'
import SignageDateInput from '@/components/SignageDateInput'

type ContentRow = {
  id: string
  type: string
  title: string | null
  media_path: string
  thumb_path: string | null
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
}

type Tab = 'pending' | 'approved' | 'rejected'

const CONTENT_COLUMNS =
  'id, type, title, media_path, thumb_path, status, submitter_name, submitter_email, requested_note, start_date, end_date, priority, all_screens, target_area_ids, target_screen_ids, full_screen, reject_reason'

const EMPTY_COUNTS: Record<Tab, number> = { pending: 0, approved: 0, rejected: 0 }

export default function SignageContentPage() {
  const { theme } = useTheme()
  const { text, muted, border, cardBg, inputBg, dark } = useSignageTheme(theme)
  const supabase = useMemo(() => createClient(), [])
  const { isManager, areas, screens } = useSignage()

  const [tab, setTab] = useState<Tab>('pending')
  const [rows, setRows] = useState<ContentRow[]>([])
  const [counts, setCounts] = useState(EMPTY_COUNTS)
  const [tabLoading, setTabLoading] = useState(true)
  const [edits, setEdits] = useState<Record<string, TargetingValue & { start_date: string; end_date: string; priority: number }>>({})
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addFile, setAddFile] = useState<File | null>(null)
  const [addTargeting, setAddTargeting] = useState<TargetingValue>({ all_screens: true, target_area_ids: [], target_screen_ids: [] })
  const [addDates, setAddDates] = useState({ title: '', start_date: '', end_date: '', priority: 0 })

  const inputStyle: React.CSSProperties = {
    background: inputBg, border: `0.5px solid ${border}`, borderRadius: 10, padding: '8px 12px', fontSize: 14, color: text, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
  }

  const loadCounts = useCallback(async () => {
    const { data } = await supabase.from('signage_content').select('status')
    const next = { ...EMPTY_COUNTS }
    for (const row of data ?? []) {
      const s = row.status as Tab
      if (s in next) next[s] += 1
    }
    setCounts(next)
  }, [supabase])

  const loadTab = useCallback(async (activeTab: Tab) => {
    setTabLoading(true)
    const { data } = await supabase
      .from('signage_content')
      .select(CONTENT_COLUMNS)
      .eq('status', activeTab)
      .order('created_at', { ascending: false })
    setRows((data as ContentRow[]) || [])
    setTabLoading(false)
  }, [supabase])

  const refreshAll = useCallback(async () => {
    await Promise.all([loadCounts(), loadTab(tab)])
  }, [loadCounts, loadTab, tab])

  useEffect(() => { void loadCounts() }, [loadCounts])
  useEffect(() => { void loadTab(tab) }, [loadTab, tab])

  const getEdit = (row: ContentRow) => edits[row.id] ?? {
    all_screens: row.all_screens,
    target_area_ids: row.target_area_ids ?? [],
    target_screen_ids: row.target_screen_ids ?? [],
    start_date: row.start_date,
    end_date: row.end_date,
    priority: row.priority,
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
    await patchContent(row.id, { status: 'approved', ...targeting })
  }

  const reject = async (row: ContentRow) => {
    if (!rejectReason.trim()) { toast('Enter a reject reason', 'error'); return }
    const ok = await patchContent(row.id, { status: 'rejected', reject_reason: rejectReason.trim() })
    if (ok) { setRejectId(null); setRejectReason('') }
  }

  const addDirect = async () => {
    if (!addFile || !addDates.start_date || !addDates.end_date) { toast('File and dates required', 'error'); return }
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
    fd.set('all_screens', String(addTargeting.all_screens))
    fd.set('target_area_ids', JSON.stringify(addTargeting.target_area_ids))
    fd.set('target_screen_ids', JSON.stringify(addTargeting.target_screen_ids))
    fd.set(addFile.type.startsWith('video/') || addFile.name.toLowerCase().endsWith('.mp4') ? 'video' : 'image', addFile)
    setBusy('add')
    const res = await fetch('/api/signage/content', { method: 'POST', body: fd })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { toast(typeof data.error === 'string' ? data.error : 'Upload failed', 'error'); return }
    toast('Content added', 'success')
    setShowAdd(false)
    setAddFile(null)
    setAddTargeting({ all_screens: true, target_area_ids: [], target_screen_ids: [] })
    setAddDates({ title: '', start_date: '', end_date: '', priority: 0 })
    void refreshAll()
  }

  return (
    <SignagePageShell title="Content">
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['pending', 'approved', 'rejected'] as Tab[]).map(t => (
          <button key={t} type="button" onClick={() => setTab(t)} style={{ padding: '8px 16px', borderRadius: 10, border: `1px solid ${border}`, background: tab === t ? '#162844' : cardBg, color: tab === t ? '#fff' : text, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
            {t} ({counts[t]})
          </button>
        ))}
        {isManager && (
          <button type="button" onClick={() => setShowAdd(v => !v)} style={{ marginLeft: 'auto', padding: '8px 16px', borderRadius: 10, border: 'none', background: '#1e6cb5', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
            {showAdd ? 'Cancel add' : '+ Add content'}
          </button>
        )}
      </div>

      {showAdd && isManager && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 12px', color: text }}>Direct upload (approved)</h3>
          <div style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
            <input placeholder="Title" value={addDates.title} onChange={e => setAddDates(d => ({ ...d, title: e.target.value }))} style={inputStyle} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 8 }}>
              <SignageDateInput value={addDates.start_date} defaultToToday colorScheme={dark ? 'dark' : 'light'} onChange={v => setAddDates(d => ({ ...d, start_date: v }))} style={inputStyle} />
              <SignageDateInput value={addDates.end_date} colorScheme={dark ? 'dark' : 'light'} onChange={v => setAddDates(d => ({ ...d, end_date: v }))} style={inputStyle} min={addDates.start_date || undefined} />
              <input type="number" value={addDates.priority} onChange={e => setAddDates(d => ({ ...d, priority: parseInt(e.target.value, 10) || 0 }))} style={inputStyle} placeholder="Priority" />
            </div>
            <SignageTargetingPicker areas={areas} screens={screens} value={addTargeting} onChange={setAddTargeting} dark={dark} border={border} text={text} muted={muted} />
            <FilePickButton accept="image/png,image/jpeg,image/webp,video/mp4" label="Choose file" changeLabel="Change file" onChange={setAddFile} />
            <button type="button" disabled={busy === 'add'} onClick={() => void addDirect()} style={{ padding: '10px 18px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', width: 'fit-content' }}>Upload & publish</button>
          </div>
        </div>
      )}

      {tabLoading ? (
        <div style={{ color: muted, padding: 24, textAlign: 'center' }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {rows.map(row => {
            const e = getEdit(row)
            const preview = row.thumb_path ? signageMediaPublicUrl(row.thumb_path) : signageMediaPublicUrl(row.media_path)
            return (
              <div key={row.id} style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 20, display: 'grid', gridTemplateColumns: 'minmax(120px, 200px) 1fr', gap: 20 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="" loading="lazy" decoding="async" style={{ width: '100%', borderRadius: 8, background: dark ? '#e8edf4' : '#f0f2f5', objectFit: 'contain', aspectRatio: '16/9' }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 17, color: text }}>{row.title || row.type}</div>
                  {row.submitter_name && <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>{row.submitter_name} · {row.submitter_email}</div>}
                  {row.requested_note && <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>Request: {row.requested_note}</div>}
                  {tab === 'pending' && (
                    <>
                      <div style={{ marginTop: 12 }}>
                        <SignageTargetingPicker
                          areas={areas}
                          screens={screens}
                          value={e}
                          onChange={v => setEdits(prev => ({ ...prev, [row.id]: { ...v, start_date: e.start_date, end_date: e.end_date, priority: e.priority } }))}
                          dark={dark}
                          border={border}
                          text={text}
                          muted={muted}
                        />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 8, marginTop: 12, maxWidth: 400 }}>
                        <SignageDateInput value={e.start_date} defaultToToday colorScheme={dark ? 'dark' : 'light'} onChange={v => setEdits(prev => ({ ...prev, [row.id]: { ...e, start_date: v } }))} style={inputStyle} />
                        <SignageDateInput value={e.end_date} colorScheme={dark ? 'dark' : 'light'} onChange={v => setEdits(prev => ({ ...prev, [row.id]: { ...e, end_date: v } }))} style={inputStyle} min={e.start_date || undefined} />
                        <input type="number" value={e.priority} onChange={ev => setEdits(prev => ({ ...prev, [row.id]: { ...e, priority: parseInt(ev.target.value, 10) || 0 } }))} style={inputStyle} />
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                        <button type="button" disabled={busy === row.id} onClick={() => void approve(row)} style={{ padding: '8px 16px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>Approve</button>
                        <button type="button" onClick={() => { setRejectId(row.id); setRejectReason('') }} style={{ padding: '8px 16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>Reject</button>
                      </div>
                      {rejectId === row.id && (
                        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                          <input value={rejectReason} onChange={ev => setRejectReason(ev.target.value)} placeholder="Reject reason" style={{ ...inputStyle, flex: 1 }} />
                          <button type="button" onClick={() => void reject(row)} style={{ padding: '8px 16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>Confirm reject</button>
                        </div>
                      )}
                    </>
                  )}
                  {row.reject_reason && tab === 'rejected' && <div style={{ marginTop: 8, color: '#ef4444', fontSize: 13 }}>{row.reject_reason}</div>}
                  {isManager && tab !== 'pending' && (
                    <button type="button" onClick={async () => {
                      if (!confirm('Delete this content?')) return
                      await fetch(`/api/signage/content/${row.id}`, { method: 'DELETE' })
                      void refreshAll()
                    }} style={{ marginTop: 12, padding: '6px 12px', background: 'transparent', border: `1px solid ${border}`, borderRadius: 8, color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                  )}
                </div>
              </div>
            )
          })}
          {!rows.length && <div style={{ color: muted, padding: 24, textAlign: 'center' }}>No {tab} items.</div>}
        </div>
      )}
    </SignagePageShell>
  )
}
