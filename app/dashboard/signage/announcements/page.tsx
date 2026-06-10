'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import Loader from '../../components/Loader'
import SignageTargetingPicker, { SignagePageShell, SignageSubnav, useSignageTheme, type TargetingValue } from '../components/SignageAdmin'

export default function SignageAnnouncementsPage() {
  const { theme } = useTheme()
  const { text, muted, border, cardBg, inputBg, dark } = useSignageTheme(theme)
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [areas, setAreas] = useState<{ id: string; name: string; slug: string }[]>([])
  const [screens, setScreens] = useState<{ id: string; code: string; name: string; area_id: string | null }[]>([])
  const [form, setForm] = useState({ title: '', subtitle: '', start_date: '', end_date: '', priority: 0, in_ticker: true, active: true })
  const [targeting, setTargeting] = useState<TargetingValue>({ all_screens: true, target_area_ids: [], target_screen_ids: [] })
  const inputStyle: React.CSSProperties = { background: inputBg, border: `0.5px solid ${border}`, borderRadius: 10, padding: '8px 12px', fontSize: 14, color: text, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }

  const load = useCallback(async () => {
    const [r, a, s] = await Promise.all([
      supabase.from('signage_announcements').select('*').order('start_date', { ascending: false }),
      supabase.from('signage_areas').select('id, name, slug'),
      supabase.from('signage_screens').select('id, code, name, area_id'),
    ])
    setRows(r.data || [])
    setAreas(a.data || [])
    setScreens(s.data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    const res = await fetch('/api/signage/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, ...targeting }),
    })
    if (!res.ok) { toast('Save failed', 'error'); return }
    toast('Announcement created', 'success')
    void load()
  }

  if (loading) return <Loader />

  return (
    <SignagePageShell title="Announcements">
      <SignageSubnav active="/dashboard/signage/announcements" isManager />
      <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 20, marginBottom: 24, maxWidth: 560 }}>
        <div style={{ display: 'grid', gap: 10 }}>
          <input placeholder="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} />
          <input placeholder="Subtitle" value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))} style={inputStyle} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={inputStyle} />
            <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} style={inputStyle} />
          </div>
          <SignageTargetingPicker areas={areas} screens={screens} value={targeting} onChange={setTargeting} dark={dark} border={border} text={text} muted={muted} />
          <label style={{ fontSize: 14, display: 'flex', gap: 8 }}><input type="checkbox" checked={form.in_ticker} onChange={e => setForm(f => ({ ...f, in_ticker: e.target.checked }))} /> Show in ticker</label>
          <button type="button" onClick={() => void save()} style={{ padding: '10px 18px', background: '#1e6cb5', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', width: 'fit-content' }}>Create</button>
        </div>
      </div>
      {rows.map(row => (
        <div key={String(row.id)} style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 14, marginBottom: 8 }}>
          <div style={{ fontWeight: 600 }}>{String(row.title)}</div>
          <div style={{ fontSize: 13, color: muted }}>{String(row.start_date)} – {String(row.end_date)}</div>
        </div>
      ))}
    </SignagePageShell>
  )
}
