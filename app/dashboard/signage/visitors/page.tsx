'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import {
  SignageDeleteButton,
  SignageListHint,
  SignagePageShell,
  SignageRowEditButton,
  deleteSignageItem,
  useSignageAdminStyles,
} from '../components/SignageAdmin'
import SignageDateInput from '@/components/SignageDateInput'

type VisitorRow = { id: string; name: string; note: string | null; visit_date: string; active: boolean }

const emptyForm = { name: '', note: '', visit_date: '', active: true }

export default function SignageVisitorsPage() {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<VisitorRow[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const resetForm = () => {
    setForm(emptyForm)
    setEditId(null)
    setShowForm(false)
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
    setShowForm(true)
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ ...s.h3, margin: 0 }}>Visitors</h3>
        <button
          type="button"
          onClick={() => { resetForm(); setShowForm(v => !v) }}
          style={s.btn}
        >
          + Add visitor
        </button>
      </div>

      {showForm && (
        <div style={{ ...s.card, marginBottom: 20, maxWidth: 640 }}>
          <h3 style={s.h3}>{editId ? 'Edit visitor' : 'Add visitor'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            <div>
              <p style={s.lbl}>Name</p>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={s.input} />
            </div>
            <div>
              <p style={s.lbl}>Note</p>
              <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} style={s.input} />
            </div>
            <div>
              <p style={s.lbl}>Visit date</p>
              <SignageDateInput value={form.visit_date} defaultToToday colorScheme={s.dark ? 'dark' : 'light'} onChange={v => setForm(f => ({ ...f, visit_date: v }))} style={s.input} />
            </div>
          </div>
          <label style={{ fontSize: 13, display: 'flex', gap: 7, alignItems: 'center', color: s.text, marginTop: 12 }}>
            <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
            Active
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button type="button" onClick={resetForm} style={s.btn}>Cancel</button>
            {editId && (
              <SignageDeleteButton
                confirmMessage={`Remove visitor entry for "${form.name}"?`}
                onConfirm={async () => {
                  if (await deleteSignageItem('/api/signage/visitors', editId)) {
                    resetForm()
                    void load()
                  }
                }}
              />
            )}
            <button type="button" onClick={() => void save()} style={s.btnPrimary}>Save</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: s.muted, padding: 16 }}>Loading…</div>
      ) : (
        <>
          <SignageListHint color={s.muted} />
          <div style={s.cardCompact}>
            <table style={s.tbl}>
              <colgroup>
                <col style={{ width: '28%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '44%' }} />
                <col style={{ width: '12%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={s.th}>Name</th>
                  <th style={s.th}>Visit date</th>
                  <th style={s.th}>Note</th>
                  <th style={s.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td style={s.td}>
                      <SignageRowEditButton onClick={() => startEdit(r)} textColor={s.text}>
                        {r.name}
                      </SignageRowEditButton>
                    </td>
                    <td style={s.tdMuted}>{r.visit_date?.slice(0, 10)}</td>
                    <td style={s.tdMuted}>{r.note || '—'}</td>
                    <td style={s.tdMuted}>{r.active ? 'Active' : 'Inactive'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <div style={{ color: s.muted, padding: 16, textAlign: 'center' }}>No visitors yet.</div>}
          </div>
        </>
      )}
    </SignagePageShell>
  )
}
