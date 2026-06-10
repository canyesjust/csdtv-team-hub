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
import { useSignage } from '../components/SignageProvider'

type Area = { id: string; name: string; slug: string; building: string | null; floor: number | null; sort_order: number }

const empty = { name: '', slug: '', building: '', floor: '', sort_order: 0 }

export default function SignageAreasPage() {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const supabase = useMemo(() => createClient(), [])
  const { refreshCatalog, activeSiteId } = useSignage()
  const [loading, setLoading] = useState(true)
  const [areas, setAreas] = useState<Area[]>([])
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('signage_areas').select('*').eq('site_id', activeSiteId).order('sort_order')
    setAreas(data || [])
    setLoading(false)
  }, [supabase, activeSiteId])

  useEffect(() => { void load() }, [load])

  const resetForm = () => {
    setForm(empty)
    setEditId(null)
    setShowForm(false)
  }

  const startEdit = (area: Area) => {
    setEditId(area.id)
    setForm({
      name: area.name,
      slug: area.slug,
      building: area.building || '',
      floor: area.floor != null ? String(area.floor) : '',
      sort_order: area.sort_order,
    })
    setShowForm(true)
  }

  const save = async () => {
    if (!form.name.trim() || !form.slug.trim()) {
      toast('Name and slug are required', 'error')
      return
    }
    const body = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      building: form.building || null,
      floor: form.floor ? parseInt(form.floor, 10) : null,
      sort_order: form.sort_order,
    }
    const res = await fetch('/api/signage/areas', {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editId ? { id: editId, ...body } : { ...body, site_id: activeSiteId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast(typeof data.error === 'string' ? data.error : 'Save failed', 'error'); return }
    toast('Saved', 'success')
    resetForm()
    await Promise.all([load(), refreshCatalog()])
  }

  return (
    <SignagePageShell title="Areas">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ ...s.h3, margin: 0 }}>Areas</h3>
        <button
          type="button"
          onClick={() => { resetForm(); setShowForm(v => !v) }}
          style={s.btn}
        >
          + Add area
        </button>
      </div>

      <p style={{ fontSize: 13, color: s.muted, margin: '0 0 16px', lineHeight: 1.55, maxWidth: 720 }}>
        Areas group screens and wayfinding entries (e.g. Main Hall, Culinary Arts). Assign an area on the Screens page so directory entries appear on those displays.
      </p>

      {showForm && (
        <div style={{ ...s.card, marginBottom: 20 }}>
          <h3 style={s.h3}>{editId ? 'Edit area' : 'Add area'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            <div>
              <p style={s.lbl}>Name</p>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={s.input} />
            </div>
            <div>
              <p style={s.lbl}>Slug</p>
              <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} style={s.input} />
            </div>
            <div>
              <p style={s.lbl}>Building</p>
              <input value={form.building} onChange={e => setForm(f => ({ ...f, building: e.target.value }))} style={s.input} />
            </div>
            <div>
              <p style={s.lbl}>Floor</p>
              <input type="number" value={form.floor} onChange={e => setForm(f => ({ ...f, floor: e.target.value }))} style={s.input} />
            </div>
            <div>
              <p style={s.lbl}>Sort order</p>
              <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value, 10) || 0 }))} style={s.input} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button type="button" onClick={resetForm} style={s.btn}>Cancel</button>
            {editId && (
              <SignageDeleteButton
                confirmMessage={`Delete area "${form.name}"? Screens in this area will lose their area link.`}
                onConfirm={async () => {
                  if (await deleteSignageItem('/api/signage/areas', editId)) {
                    resetForm()
                    await Promise.all([load(), refreshCatalog()])
                  }
                }}
              />
            )}
            <button type="button" onClick={() => void save()} style={s.btnPrimary}>Save</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: s.muted, padding: 16 }}>Loading areas…</div>
      ) : (
        <>
          <SignageListHint color={s.muted} />
          <div style={s.cardCompact}>
            <table style={s.tbl}>
              <colgroup>
                <col style={{ width: '28%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={s.th}>Name</th>
                  <th style={s.th}>Slug</th>
                  <th style={s.th}>Building</th>
                  <th style={s.th}>Floor</th>
                  <th style={s.th}>Sort</th>
                </tr>
              </thead>
              <tbody>
                {areas.map(a => (
                  <tr key={a.id}>
                    <td style={s.td}>
                      <SignageRowEditButton onClick={() => startEdit(a)} textColor={s.text}>
                        {a.name}
                      </SignageRowEditButton>
                    </td>
                    <td style={s.tdMuted}>{a.slug}</td>
                    <td style={s.tdMuted}>{a.building || '—'}</td>
                    <td style={s.tdMuted}>{a.floor ?? '—'}</td>
                    <td style={s.tdMuted}>{a.sort_order}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!areas.length && <div style={{ color: s.muted, padding: 16, textAlign: 'center' }}>No areas yet.</div>}
          </div>
        </>
      )}
    </SignagePageShell>
  )
}
