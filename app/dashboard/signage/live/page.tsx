'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import Loader from '../../components/Loader'
import SignageTargetingPicker, { SignagePageShell, SignageSubnav, useSignageTheme, type TargetingValue } from '../components/SignageAdmin'

export default function SignageLivePage() {
  const { theme } = useTheme()
  const { text, muted, border, cardBg, inputBg, dark } = useSignageTheme(theme)
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [areas, setAreas] = useState<{ id: string; name: string; slug: string }[]>([])
  const [screens, setScreens] = useState<{ id: string; code: string; name: string; area_id: string | null }[]>([])
  const [form, setForm] = useState({ is_live: false, hls_url: '', label: '', all_screens: true })
  const [targeting, setTargeting] = useState<TargetingValue>({ all_screens: true, target_area_ids: [], target_screen_ids: [] })
  const inputStyle: React.CSSProperties = { background: inputBg, border: `0.5px solid ${border}`, borderRadius: 10, padding: '8px 12px', fontSize: 14, color: text, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }

  const load = useCallback(async () => {
    const [liveRes, a, s] = await Promise.all([
      fetch('/api/signage/live'),
      supabase.from('signage_areas').select('id, name, slug'),
      supabase.from('signage_screens').select('id, code, name, area_id'),
    ])
    const liveData = await liveRes.json().catch(() => ({}))
    const live = liveData.live
    if (live) {
      setForm({ is_live: live.is_live, hls_url: live.hls_url || '', label: live.label || '', all_screens: live.all_screens })
      setTargeting({ all_screens: live.all_screens, target_area_ids: live.target_area_ids || [], target_screen_ids: live.target_screen_ids || [] })
    }
    setAreas(a.data || [])
    setScreens(s.data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    const res = await fetch('/api/signage/live', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, ...targeting }),
    })
    if (!res.ok) { toast('Save failed', 'error'); return }
    toast('Live state updated', 'success')
  }

  if (loading) return <Loader />

  return (
    <SignagePageShell title="Live stream">
      <SignageSubnav active="/dashboard/signage/live" isManager />
      <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 20, maxWidth: 560 }}>
        <label style={{ display: 'flex', gap: 8, marginBottom: 12, fontSize: 15, color: text }}>
          <input type="checkbox" checked={form.is_live} onChange={e => setForm(f => ({ ...f, is_live: e.target.checked }))} />
          Live on air
        </label>
        <input placeholder="HLS URL (m3u8)" value={form.hls_url} onChange={e => setForm(f => ({ ...f, hls_url: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} />
        <input placeholder="Label" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} style={{ ...inputStyle, marginBottom: 12 }} />
        <SignageTargetingPicker areas={areas} screens={screens} value={targeting} onChange={v => { setTargeting(v); setForm(f => ({ ...f, all_screens: v.all_screens })) }} dark={dark} border={border} text={text} muted={muted} />
        <p style={{ fontSize: 13, color: muted, margin: '12px 0' }}>Broadcast control can also PATCH /api/signage/live on go-live.</p>
        <button type="button" onClick={() => void save()} style={{ padding: '10px 18px', background: form.is_live ? '#ef4444' : '#1e6cb5', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
          {form.is_live ? 'Apply live takeover' : 'Clear live / save'}
        </button>
      </div>
    </SignagePageShell>
  )
}
