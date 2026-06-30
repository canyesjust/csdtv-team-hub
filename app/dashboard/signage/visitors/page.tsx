'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSignage } from '../components/SignageProvider'
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
import { singleDateLifecycle, LIFECYCLE_RANK, LifecyclePill, todayISO } from '@/lib/signage/lifecycle'

type VisitorRow = { id: string; name: string; note: string | null; visit_date: string; active: boolean; pending: boolean; submitter_name: string | null }

const emptyForm = { name: '', note: '', visit_date: '', active: true }

export default function SignageVisitorsPage() {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const { activeSiteId } = useSignage()
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<VisitorRow[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showPast, setShowPast] = useState(false)

  const resetForm = () => {
    setForm(emptyForm)
    setEditId(null)
    setShowForm(false)
  }

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('signage_visitors')
      .select('id, name, note, visit_date, active, pending, submitter_name')
      .eq('site_id', activeSiteId)
      .order('visit_date', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }, [supabase, activeSiteId])

  const today = useMemo(() => todayISO(), [])
  const pendingRows = useMemo(() => rows.filter(r => r.pending), [rows])
  const liveRows = useMemo(() =>
    rows.filter(r => !r.pending).sort((a, b) =>
      LIFECYCLE_RANK[singleDateLifecycle(a.visit_date, today)] - LIFECYCLE_RANK[singleDateLifecycle(b.visit_date, today)]
      || (b.visit_date || '').localeCompare(a.visit_date || '')
    ), [rows, today])
  const hasPast = useMemo(
    () => liveRows.some(r => singleDateLifecycle(r.visit_date, today) === 'expired'),
    [liveRows, today],
  )
  const visibleRows = useMemo(
    () => showPast ? liveRows : liveRows.filter(r => singleDateLifecycle(r.visit_date, today) !== 'expired'),
    [liveRows, showPast, today],
  )

  const approve = async (r: VisitorRow) => {
    const res = await fetch('/api/signage/visitors', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: r.id, name: r.name, note: r.note, visit_date: r.visit_date, active: true, pending: false }),
    })
    if (!res.ok) { toast('Approve failed', 'error'); return }
    toast('Visitor approved', 'success')
    void load()
  }

  const initials = (name: string) =>
    name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?'
  const avatarStyle: React.CSSProperties = {
    width: 38, height: 38, borderRadius: '50%', background: s.infoBg, color: s.info,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0,
  }

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
      body: JSON.stringify(editId ? { id: editId, ...form } : { ...form, site_id: activeSiteId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast(typeof data.error === 'string' ? data.error : 'Save failed', 'error'); return }
    toast(editId ? 'Visitor updated' : 'Visitor added', 'success')
    resetForm()
    void load()
  }

  return (
    <SignagePageShell title="Visitors" subtitle="Welcome guests by name on the screens">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => { resetForm(); setShowForm(v => !v) }}
          style={s.btnPrimary}
        >
          {showForm ? 'Cancel' : '+ Add visitor'}
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
          {pendingRows.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ ...s.h3, fontSize: 14 }}>Pending review ({pendingRows.length})</h3>
              {pendingRows.map(r => (
                <div key={r.id} style={{ ...s.card, padding: '12px 14px', marginBottom: 8, borderLeft: '3px solid #d97706', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={avatarStyle} aria-hidden>{initials(r.name)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: s.text }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: s.muted, marginTop: 4 }}>
                      {r.visit_date?.slice(0, 10)}{r.note ? ` · ${r.note}` : ''}{r.submitter_name ? ` · from ${r.submitter_name}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button type="button" onClick={() => void approve(r)} style={s.btnPrimary}>Approve</button>
                    <SignageDeleteButton
                      label="Reject"
                      confirmMessage={`Reject visitor entry for "${r.name}"?`}
                      onConfirm={async () => { if (await deleteSignageItem('/api/signage/visitors', r.id)) void load() }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <SignageListHint color={s.muted}>Click a name to edit.</SignageListHint>
            {hasPast && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: s.muted, cursor: 'pointer' }}>
                <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} />
                Show past
              </label>
            )}
          </div>
          {visibleRows.map(r => (
            <div key={r.id} style={{ ...s.card, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={avatarStyle} aria-hidden>{initials(r.name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <SignageRowEditButton onClick={() => startEdit(r)} textColor={s.text} fontWeight={600}>
                  {r.name}{!r.active && <span style={{ color: s.muted, fontWeight: 400 }}> (off)</span>}
                </SignageRowEditButton>
                <div style={{ fontSize: 12, color: s.muted, marginTop: 4 }}>
                  {r.visit_date?.slice(0, 10)}{r.note ? ` · ${r.note}` : ''}
                </div>
              </div>
              {r.active
                ? <LifecyclePill lifecycle={singleDateLifecycle(r.visit_date, today)} />
                : <span style={{ fontSize: 12, color: s.muted }}>Off</span>}
            </div>
          ))}
          {!visibleRows.length && (
            <div style={{ color: s.muted, padding: 16, textAlign: 'center' }}>
              {liveRows.length ? 'No current or upcoming visitors.' : 'No visitors yet.'}
            </div>
          )}
        </>
      )}
    </SignagePageShell>
  )
}
