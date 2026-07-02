'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import SignageTargetingPicker, {
  SignageAnnouncementIconPicker,
  SignageDeleteButton,
  SignageListHint,
  SignagePageShell,
  SignageRowEditButton,
  deleteSignageItem,
  formatSignageDate,
  useSignageAdminStyles,
  type TargetingValue,
} from '../components/SignageAdmin'
import { useSignage } from '../components/SignageProvider'
import SignageDateInput from '@/components/SignageDateInput'
import {
  announcementIconEmoji,
  announcementScopeLabel,
  type SignageAnnouncementIconId,
} from '@/lib/signage/announcement-icons'
import { dateRangeLifecycle, LIFECYCLE_GROUPS, LifecyclePill, todayISO } from '@/lib/signage/lifecycle'

type AnnouncementRow = {
  id: string
  title: string
  subtitle: string | null
  icon: string
  start_date: string
  end_date: string
  priority: number
  in_ticker: boolean
  active: boolean
  all_screens: boolean
  target_area_ids: string[]
  target_screen_ids: string[]
  target_buildings: string[]
  pending: boolean
  submitter_name: string | null
}

const emptyForm = {
  title: '',
  subtitle: '',
  icon: 'bell' as SignageAnnouncementIconId,
  start_date: '',
  end_date: '',
  priority: 0,
  in_ticker: true,
  active: true,
  pinToTop: false,
}

const emptyTargeting: TargetingValue = { all_screens: true, target_area_ids: [], target_screen_ids: [] }

const PIN_PRIORITY = 100

export default function SignageAnnouncementsPage() {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const supabase = useMemo(() => createClient(), [])
  const { areas, screens, activeSiteId } = useSignage()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<AnnouncementRow[]>([])
  const [form, setForm] = useState(emptyForm)
  const [targeting, setTargeting] = useState<TargetingValue>(emptyTargeting)
  const [editId, setEditId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showPast, setShowPast] = useState(false)

  const resetForm = () => {
    setForm(emptyForm)
    setTargeting(emptyTargeting)
    setEditId(null)
    setShowForm(false)
  }

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('signage_announcements')
      .select('id, title, subtitle, icon, start_date, end_date, priority, in_ticker, active, all_screens, target_area_ids, target_screen_ids, target_buildings, pending, submitter_name')
      .eq('site_id', activeSiteId)
      .order('start_date', { ascending: false })
    if (error) {
      toast(error.message, 'error')
      setLoading(false)
      return
    }
    setRows((data as AnnouncementRow[]) || [])
    setLoading(false)
  }, [supabase, activeSiteId])

  useEffect(() => { void load() }, [load])

  const startEdit = (row: AnnouncementRow) => {
    setEditId(row.id)
    setShowForm(true)
    setForm({
      title: row.title,
      subtitle: row.subtitle || '',
      icon: (row.icon || 'bell') as SignageAnnouncementIconId,
      start_date: row.start_date?.slice(0, 10) ?? '',
      end_date: row.end_date?.slice(0, 10) ?? '',
      priority: row.priority,
      in_ticker: row.in_ticker,
      active: row.active,
      pinToTop: row.priority >= PIN_PRIORITY,
    })
    setTargeting({
      all_screens: row.all_screens,
      target_area_ids: row.target_area_ids ?? [],
      target_screen_ids: row.target_screen_ids ?? [],
      target_buildings: row.target_buildings ?? [],
    })
  }

  const save = async () => {
    if (!form.title.trim()) { toast('Title is required', 'error'); return }
    if (!form.start_date || !form.end_date) { toast('Start and end dates are required', 'error'); return }
    const priority = form.pinToTop ? PIN_PRIORITY : 0
    const payload = {
      title: form.title,
      subtitle: form.subtitle,
      icon: form.icon,
      start_date: form.start_date,
      end_date: form.end_date,
      priority,
      in_ticker: form.in_ticker,
      active: form.active,
      ...targeting,
      ...(editId ? { id: editId } : {}),
    }
    const res = await fetch('/api/signage/announcements', {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editId ? payload : { ...payload, site_id: activeSiteId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast(typeof data.error === 'string' ? data.error : 'Save failed', 'error'); return }
    toast(editId ? 'Announcement updated' : 'Announcement published', 'success')
    resetForm()
    void load()
  }

  const approve = async (id: string) => {
    const res = await fetch('/api/signage/announcements', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, pending: false, active: true }),
    })
    if (!res.ok) { toast('Approve failed', 'error'); return }
    toast('Announcement approved', 'success')
    void load()
  }

  const today = useMemo(() => todayISO(), [])
  const pendingRows = useMemo(() => rows.filter(r => r.pending), [rows])
  const liveRows = useMemo(() => rows.filter(r => !r.pending), [rows])
  const hasPast = useMemo(
    () => liveRows.some(r => dateRangeLifecycle(r.start_date, r.end_date, today) === 'expired'),
    [liveRows, today],
  )

  const areaNameById = useMemo(() => new Map(areas.map(a => [a.id, a.name])), [areas])
  const screenNameById = useMemo(() => new Map(screens.map(sc => [sc.id, sc.name])), [screens])

  const targetingLabel = (row: AnnouncementRow) => {
    const label = announcementScopeLabel(row, areaNameById, screenNameById)
    return label ?? 'All screens'
  }

  const avatarStyle: React.CSSProperties = {
    width: 38, height: 38, borderRadius: 10, background: s.infoBg, color: s.info,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0,
  }

  return (
    <SignagePageShell title="Announcements" subtitle="Short messages & ticker notes on the screens">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => { resetForm(); setShowForm(v => !v) }}
          style={s.btnPrimary}
        >
          {showForm ? 'Cancel' : '+ Add announcement'}
        </button>
      </div>

      {showForm && (
        <div style={{ ...s.card, marginBottom: 24, maxWidth: 560 }}>
          <h3 style={s.h3}>{editId ? 'Edit announcement' : 'Add announcement'}</h3>
          <div style={{ marginBottom: 12 }}>
            <p style={s.lbl}>Title</p>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={s.input} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <p style={s.lbl}>Subtitle</p>
            <input value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))} style={s.input} placeholder="e.g. Today 2:00 PM" />
          </div>
          <SignageAnnouncementIconPicker
            value={form.icon}
            onChange={icon => setForm(f => ({ ...f, icon }))}
            lbl={s.lbl}
          />
          <SignageTargetingPicker areas={areas} screens={screens} value={targeting} onChange={setTargeting} lbl={s.lbl} />
          <div style={{ ...s.row, marginBottom: 14, marginTop: 6 }}>
            <div style={{ flex: 1, minWidth: 130 }}>
              <p style={s.lbl}>Start date</p>
              <SignageDateInput value={form.start_date} defaultToToday colorScheme={s.dark ? 'dark' : 'light'} onChange={v => setForm(f => ({ ...f, start_date: v }))} style={s.input} />
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <p style={s.lbl}>End date</p>
              <SignageDateInput value={form.end_date} colorScheme={s.dark ? 'dark' : 'light'} onChange={v => setForm(f => ({ ...f, end_date: v }))} style={s.input} min={form.start_date || undefined} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 18, marginBottom: 16 }}>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 7, color: s.text }}>
              <input type="checkbox" checked={form.in_ticker} onChange={e => setForm(f => ({ ...f, in_ticker: e.target.checked }))} />
              Show in ticker
            </label>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 7, color: s.text }}>
              <input type="checkbox" checked={form.pinToTop} onChange={e => setForm(f => ({ ...f, pinToTop: e.target.checked }))} />
              Pin to top
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={resetForm} style={s.btn}>Cancel</button>
            {editId && (
              <SignageDeleteButton
                confirmMessage={`Delete announcement "${form.title}"?`}
                onConfirm={async () => {
                  if (await deleteSignageItem('/api/signage/announcements', editId)) {
                    resetForm()
                    void load()
                  }
                }}
              />
            )}
            <button type="button" onClick={() => void save()} style={s.btnPrimary}>{editId ? 'Save' : 'Publish'}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: s.muted, padding: 16 }}>Loading…</div>
      ) : (
        <>
          {pendingRows.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ ...s.h3, fontSize: 14 }}>Pending review ({pendingRows.length})</h3>
              {pendingRows.map(row => (
                <div key={row.id} style={{ ...s.card, padding: '12px 14px', marginBottom: 8, borderLeft: '3px solid #d97706', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={avatarStyle} aria-hidden>{announcementIconEmoji(row.icon)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: s.text }}>{row.title}</div>
                    {row.subtitle && <div style={{ fontSize: 13, color: s.muted, marginTop: 2 }}>{row.subtitle}</div>}
                    <div style={{ fontSize: 12, color: s.muted, marginTop: 4 }}>
                      {formatSignageDate(row.start_date)} – {formatSignageDate(row.end_date)}
                      {' · '}{targetingLabel(row)}
                      {row.submitter_name ? ` · from ${row.submitter_name}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button type="button" onClick={() => void approve(row.id)} style={s.btnPrimary}>Approve</button>
                    <SignageDeleteButton
                      label="Reject"
                      confirmMessage={`Reject announcement "${row.title}"?`}
                      onConfirm={async () => { if (await deleteSignageItem('/api/signage/announcements', row.id)) void load() }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <SignageListHint color={s.muted}>Click a title to edit.</SignageListHint>
            {hasPast && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: s.muted, cursor: 'pointer' }}>
                <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} />
                Show past
              </label>
            )}
          </div>
          {LIFECYCLE_GROUPS.map(group => {
            if (group.key === 'expired' && !showPast) return null
            const groupRows = liveRows.filter(r => dateRangeLifecycle(r.start_date, r.end_date, today) === group.key)
            if (!groupRows.length) return null
            return (
              <div key={group.key} style={{ marginBottom: 18 }}>
                <h4 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: s.muted, margin: '0 0 8px' }}>{group.heading}</h4>
                {groupRows.map(row => (
                  <div key={row.id} style={{ ...s.card, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={avatarStyle} aria-hidden>{announcementIconEmoji(row.icon)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <SignageRowEditButton onClick={() => startEdit(row)} textColor={s.text} fontWeight={600}>
                        {row.title}{!row.active && <span style={{ color: s.muted, fontWeight: 400 }}> (inactive)</span>}
                      </SignageRowEditButton>
                      {row.subtitle && <div style={{ fontSize: 13, color: s.muted, marginTop: 2 }}>{row.subtitle}</div>}
                      <div style={{ fontSize: 12, color: s.muted, marginTop: 4 }}>
                        {formatSignageDate(row.start_date)} – {formatSignageDate(row.end_date)}
                        {' · '}{targetingLabel(row)}
                        {row.priority >= PIN_PRIORITY ? ' · pinned' : ''}
                      </div>
                    </div>
                    <LifecyclePill lifecycle={dateRangeLifecycle(row.start_date, row.end_date, today)} />
                  </div>
                ))}
              </div>
            )
          })}
          {!rows.length && <div style={{ color: s.muted, padding: 16, textAlign: 'center' }}>No announcements yet.</div>}
        </>
      )}
    </SignagePageShell>
  )
}
