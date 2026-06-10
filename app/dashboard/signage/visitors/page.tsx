'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { SignageDeleteButton, SignagePageShell, deleteSignageItem, useSignageTheme } from '../components/SignageAdmin'
import SignageDateInput from '@/components/SignageDateInput'

export default function SignageVisitorsPage() {
  const { theme } = useTheme()
  const { text, border, cardBg, inputBg } = useSignageTheme(theme)
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Array<{ id: string; name: string; note: string | null; visit_date: string; active: boolean }>>([])
  const [form, setForm] = useState({ name: '', note: '', visit_date: '' })
  const inputStyle: React.CSSProperties = { background: inputBg, border: `0.5px solid ${border}`, borderRadius: 10, padding: '8px 12px', fontSize: 14, color: text, fontFamily: 'inherit' }

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('signage_visitors')
      .select('id, name, note, visit_date, active')
      .order('visit_date', { ascending: false })
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

  return (
    <SignagePageShell title="Visiting today">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <input placeholder="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
        <input placeholder="Note" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} style={inputStyle} />
        <SignageDateInput value={form.visit_date} defaultToToday onChange={v => setForm(f => ({ ...f, visit_date: v }))} style={inputStyle} />
        <button type="button" onClick={() => void save()} style={{ padding: '8px 16px', background: '#1e6cb5', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
      </div>
      {loading ? (
        <div style={{ color: '#6b7280', padding: 16 }}>Loading…</div>
      ) : (
        rows.map(r => (
          <div key={r.id} style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 14, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span>{r.visit_date}: {r.name}{r.note ? ` — ${r.note}` : ''}</span>
            <SignageDeleteButton
              confirmMessage={`Remove visitor entry for "${r.name}"?`}
              onConfirm={async () => {
                if (await deleteSignageItem('/api/signage/visitors', r.id)) void load()
              }}
            />
          </div>
        ))
      )}
    </SignagePageShell>
  )
}
