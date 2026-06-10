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
  const { areas, screens } = useSignage()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<AnnouncementRow[]>([])
  const [form, setForm] = useState(emptyForm)
  const [targeting, setTargeting] = useState<TargetingValue>(emptyTargeting)
  const [editId, setEditId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const resetForm = () => {
    setForm(emptyForm)
    setTargeting(emptyTargeting)
    setEditId(null)
    setShowForm(false)
  }

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('signage_announcements')
      .select('id, title, subtitle, icon, start_date, end_date, priority, in_ticker, active, all_screens, target_area_ids, target_screen_ids')
      .order('start_date', { ascending: false })
    if (error) {
      toast(error.message, 'error')
      setLoading(false)
      return
    }
    setRows((data as AnnouncementRow[]) || [])
    setLoading(false)
  }, [supabase])

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
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast(typeof data.error === 'string' ? data.error : 'Save failed', 'error'); return }
    toast(editId ? 'Announcement updated' : 'Announcement published', 'success')
    resetForm()
    void load()
  }

  const areaNameById = useMemo(() => new Map(areas.map(a => [a.id, a.name])), [areas])
  const screenNameById = useMemo(() => new Map(screens.map(sc => [sc.id, sc.name])), [screens])

  const targetingLabel = (row: AnnouncementRow) => {
    const label = announcementScopeLabel(row, areaNameById, screenNameById)
    return label ?? 'All screens'
  }

  return (
    <SignagePageShell title="Announcements">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ ...s.h3, margin: 0 }}>Announcements</h3>
        <button
          type="button"
          onClick={() => { resetForm(); setShowForm(v => !v) }}
          style={s.btn}
        >
          + Add announcement
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
          <SignageListHint color={s.muted}>Click a title to edit.</SignageListHint>
          {rows.map(row => (
            <div key={row.id} style={{ ...s.cardCompact, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <SignageRowEditButton onClick={() => startEdit(row)} textColor={s.text} fontWeight={600}>
                  <span aria-hidden style={{ marginRight: 6 }}>{announcementIconEmoji(row.icon)}</span>
                  {row.title}{!row.active && <span style={{ color: s.muted, fontWeight: 400 }}> (inactive)</span>}
                </SignageRowEditButton>
                {row.subtitle && <div style={{ fontSize: 13, color: s.muted, marginTop: 2 }}>{row.subtitle}</div>}
                <div style={{ fontSize: 12, color: s.muted, marginTop: 4 }}>
                  {formatSignageDate(row.start_date)} – {formatSignageDate(row.end_date)}
                  {' · '}{targetingLabel(row)}
                  {row.priority >= PIN_PRIORITY ? ' · pinned' : ''}
                </div>
              </div>
            </div>
          ))}
          {!rows.length && <div style={{ color: s.muted, padding: 16, textAlign: 'center' }}>No announcements yet.</div>}
        </>
      )}
    </SignagePageShell>
  )
}
