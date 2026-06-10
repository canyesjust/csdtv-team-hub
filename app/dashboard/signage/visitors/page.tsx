'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { SignageDeleteButton, SignageEditButton, SignagePageShell, deleteSignageItem, useSignageTheme } from '../components/SignageAdmin'
import SignageDateInput from '@/components/SignageDateInput'

type VisitorRow = { id: string; name: string; note: string | null; visit_date: string; active: boolean }

const emptyForm = { name: '', note: '', visit_date: '', active: true }

export default function SignageVisitorsPage() {
  const { theme } = useTheme()
  const { text, muted, border, cardBg, inputBg, dark } = useSignageTheme(theme)
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<VisitorRow[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)
  const inputStyle: React.CSSProperties = { background: inputBg, border: `0.5px solid ${border}`, borderRadius: 10, padding: '8px 12px', fontSize: 14, color: text, fontFamily: 'inherit' }

  const resetForm = () => {
    setForm(emptyForm)
    setEditId(null)
  }

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('signage_visitors')
      .select('id, name, note, visit_date, active')
      .order('visit_date', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { void load() }, [load])

  const startEdit = (row: VisitorRow) => {
    setEditId(row.id)
    setForm({
      name: row.name,
      note: row.note || '',
      visit_date: row.visit_date?.slice(0, 10) ?? '',
      active: row.active,
    })
  }

  const save = async () => {
    if (!form.name.trim() || !form.visit_date) { toast('Name and visit date are required', 'error'); return }
    const res = await fetch('/api/signage/visitors', {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editId ? { id: editId, ...form } : form),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast(typeof data.error === 'string' ? data.error : 'Save failed', 'error'); return }
    toast(editId ? 'Visitor updated' : 'Visitor added', 'success')
    resetForm()
    void load()
  }

  return (
    <SignagePageShell title="Visiting today">
      <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 16, marginBottom: 20, maxWidth: 640 }}>
        <h3 style={{ margin: '0 0 12px', color: text }}>{editId ? 'Edit visitor' : 'Add visitor'}</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
          <input placeholder="Note" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} style={inputStyle} />
          <SignageDateInput value={form.visit_date} defaultToToday colorScheme={dark ? 'dark' : 'light'} onChange={v => setForm(f => ({ ...f, visit_date: v }))} style={inputStyle} />
          <label style={{ fontSize: 14, display: 'flex', gap: 6, alignItems: 'center', color: text }}>
            <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} /> Active
          </label>
          <button type="button" onClick={() => void save()} style={{ padding: '8px 16px', background: '#1e6cb5', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>{editId ? 'Update' : 'Add'}</button>
          {editId && (
            <button type="button" onClick={resetForm} style={{ padding: '8px 16px', background: 'transparent', color: text, border: `1px solid ${border}`, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          )}
        </div>
      </div>
      {loading ? (
        <div style={{ color: muted, padding: 16 }}>Loading…</div>
      ) : (
        rows.map(r => (
          <div key={r.id} style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 14, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ color: text }}>{r.visit_date?.slice(0, 10)}: {r.name}{r.note ? ` — ${r.note}` : ''}{!r.active && <span style={{ color: muted }}> (inactive)</span>}</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <SignageEditButton onClick={() => startEdit(r)} />
              <SignageDeleteButton
                confirmMessage={`Remove visitor entry for "${r.name}"?`}
                onConfirm={async () => {
                  if (await deleteSignageItem('/api/signage/visitors', r.id)) {
                    if (editId === r.id) resetForm()
                    void load()
                  }
                }}
              />
            </div>
          </div>
        ))
      )}
    </SignagePageShell>
  )
}
