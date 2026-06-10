'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import SignageTargetingPicker, { SignageDeleteButton, SignagePageShell, deleteSignageItem, useSignageTheme, type TargetingValue } from '../components/SignageAdmin'
import { useSignage } from '../components/SignageProvider'
import SignageDateInput from '@/components/SignageDateInput'

export default function SignageAnnouncementsPage() {
  const { theme } = useTheme()
  const { text, muted, border, cardBg, inputBg, dark } = useSignageTheme(theme)
  const supabase = useMemo(() => createClient(), [])
  const { areas, screens } = useSignage()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Array<{ id: string; title: string; subtitle: string | null; start_date: string; end_date: string }>>([])
  const [form, setForm] = useState({ title: '', subtitle: '', start_date: '', end_date: '', priority: 0, in_ticker: true, active: true })
  const [targeting, setTargeting] = useState<TargetingValue>({ all_screens: true, target_area_ids: [], target_screen_ids: [] })
  const inputStyle: React.CSSProperties = { background: inputBg, border: `0.5px solid ${border}`, borderRadius: 10, padding: '8px 12px', fontSize: 14, color: text, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('signage_announcements')
      .select('id, title, subtitle, start_date, end_date')
      .order('start_date', { ascending: false })
    if (error) {
      toast(error.message, 'error')
      setLoading(false)
      return
    }
    setRows(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!form.title.trim()) { toast('Title is required', 'error'); return }
    if (!form.start_date || !form.end_date) { toast('Start and end dates are required', 'error'); return }
    const res = await fetch('/api/signage/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, ...targeting }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast(typeof data.error === 'string' ? data.error : 'Save failed', 'error'); return }
    toast('Announcement created', 'success')
    setForm({ title: '', subtitle: '', start_date: '', end_date: '', priority: 0, in_ticker: true, active: true })
    void load()
  }

  return (
    <SignagePageShell title="Announcements">
      <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 20, marginBottom: 24, maxWidth: 560 }}>
        <div style={{ display: 'grid', gap: 10 }}>
          <input placeholder="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} />
          <input placeholder="Subtitle" value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))} style={inputStyle} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <SignageDateInput value={form.start_date} defaultToToday colorScheme={dark ? 'dark' : 'light'} onChange={v => setForm(f => ({ ...f, start_date: v }))} style={inputStyle} />
            <SignageDateInput value={form.end_date} colorScheme={dark ? 'dark' : 'light'} onChange={v => setForm(f => ({ ...f, end_date: v }))} style={inputStyle} min={form.start_date || undefined} />
          </div>
          <SignageTargetingPicker areas={areas} screens={screens} value={targeting} onChange={setTargeting} dark={dark} border={border} text={text} muted={muted} />
          <label style={{ fontSize: 14, display: 'flex', gap: 8 }}><input type="checkbox" checked={form.in_ticker} onChange={e => setForm(f => ({ ...f, in_ticker: e.target.checked }))} /> Show in ticker</label>
          <button type="button" onClick={() => void save()} style={{ padding: '10px 18px', background: '#1e6cb5', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', width: 'fit-content' }}>Create</button>
        </div>
      </div>
      {loading ? (
        <div style={{ color: muted, padding: 16 }}>Loading…</div>
      ) : (
        rows.map(row => (
          <div key={row.id} style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 14, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, color: text }}>{row.title}</div>
              {row.subtitle && <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>{row.subtitle}</div>}
              <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>{row.start_date} – {row.end_date}</div>
            </div>
            <SignageDeleteButton
              confirmMessage={`Delete announcement "${row.title}"?`}
              onConfirm={async () => {
                if (await deleteSignageItem('/api/signage/announcements', row.id)) void load()
              }}
            />
          </div>
        ))
      )}
    </SignagePageShell>
  )
}
