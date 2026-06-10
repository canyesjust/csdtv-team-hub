'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import Loader from '../../components/Loader'
import { SignagePageShell, SignageSubnav, useSignageTheme } from '../components/SignageAdmin'

export default function SignageVisitorsPage() {
  const { theme } = useTheme()
  const { text, border, cardBg, inputBg } = useSignageTheme(theme)
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Array<{ id: string; name: string; note: string | null; visit_date: string; active: boolean }>>([])
  const [form, setForm] = useState({ name: '', note: '', visit_date: '' })
  const inputStyle: React.CSSProperties = { background: inputBg, border: `0.5px solid ${border}`, borderRadius: 10, padding: '8px 12px', fontSize: 14, color: text, fontFamily: 'inherit' }

  const load = useCallback(async () => {
    const { data } = await supabase.from('signage_visitors').select('*').order('visit_date', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    const res = await fetch('/api/signage/visitors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, active: true }) })
    if (!res.ok) { toast('Save failed', 'error'); return }
    toast('Visitor added', 'success')
    setForm({ name: '', note: '', visit_date: '' })
    void load()
  }

  if (loading) return <Loader />

  return (
    <SignagePageShell title="Visiting today">
      <SignageSubnav active="/dashboard/signage/visitors" isManager />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <input placeholder="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
        <input placeholder="Note" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} style={inputStyle} />
        <input type="date" value={form.visit_date} onChange={e => setForm(f => ({ ...f, visit_date: e.target.value }))} style={inputStyle} />
        <button type="button" onClick={() => void save()} style={{ padding: '8px 16px', background: '#1e6cb5', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
      </div>
      {rows.map(r => (
        <div key={r.id} style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 14, marginBottom: 8 }}>
          {r.visit_date}: {r.name}{r.note ? ` — ${r.note}` : ''}
        </div>
      ))}
    </SignagePageShell>
  )
}
