'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import Loader from '../../components/Loader'
import { SignagePageShell, SignageSubnav, useSignageTheme } from '../components/SignageAdmin'

const DIRECTIONS = ['left', 'right', 'up', 'down', 'straight'] as const

export default function SignageWayfindingPage() {
  const { theme } = useTheme()
  const { text, border, cardBg, inputBg } = useSignageTheme(theme)
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [areas, setAreas] = useState<{ id: string; name: string }[]>([])
  const [entries, setEntries] = useState<Array<{ id: string; area_id: string; destination: string; direction: string; sort_order: number }>>([])
  const [form, setForm] = useState({ area_id: '', destination: '', direction: 'right', sort_order: 0 })
  const inputStyle: React.CSSProperties = { background: inputBg, border: `0.5px solid ${border}`, borderRadius: 10, padding: '8px 12px', fontSize: 14, color: text, fontFamily: 'inherit' }

  const load = useCallback(async () => {
    const [a, w] = await Promise.all([
      supabase.from('signage_areas').select('id, name').order('sort_order'),
      supabase.from('signage_wayfinding').select('*').order('sort_order'),
    ])
    setAreas(a.data || [])
    setEntries(w.data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    const res = await fetch('/api/signage/wayfinding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    if (!res.ok) { toast('Save failed', 'error'); return }
    toast('Added', 'success')
    setForm({ area_id: form.area_id, destination: '', direction: 'right', sort_order: 0 })
    void load()
  }

  if (loading) return <Loader />

  const areaName = (id: string) => areas.find(a => a.id === id)?.name || id

  return (
    <SignagePageShell title="Wayfinding">
      <SignageSubnav active="/dashboard/signage/wayfinding" isManager />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <select value={form.area_id} onChange={e => setForm(f => ({ ...f, area_id: e.target.value }))} style={inputStyle}>
          <option value="">Select area</option>
          {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input placeholder="Destination" value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} style={inputStyle} />
        <select value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))} style={inputStyle}>
          {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <button type="button" onClick={() => void save()} style={{ padding: '8px 16px', background: '#1e6cb5', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
      </div>
      {entries.map(e => (
        <div key={e.id} style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 14, marginBottom: 8 }}>
          {areaName(e.area_id)} — {e.destination} ({e.direction})
        </div>
      ))}
    </SignagePageShell>
  )
}
