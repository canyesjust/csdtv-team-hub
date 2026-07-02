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
import { slugify } from '@/lib/signage/slug'

type Area = { id: string; name: string; slug: string; building: string | null; floor: number | null; sort_order: number }

const empty = { name: '', slug: '', building: '', floor: '', sort_order: 0 }

export default function SignageAreasPage() {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const supabase = useMemo(() => createClient(), [])
  const { refreshCatalog, activeSiteId, screens } = useSignage()
  const [loading, setLoading] = useState(true)
  const [areas, setAreas] = useState<Area[]>([])
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  // Once a slug is hand-edited we stop auto-filling it from the name.
  const [slugTouched, setSlugTouched] = useState(false)

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
    setSlugTouched(false)
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
    setSlugTouched(true)
  }

  const save = async () => {
    if (!form.name.trim()) {
      toast('Name is required', 'error')
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
    <SignagePageShell title="Areas" subtitle="Group screens & wayfinding entries by space">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => { resetForm(); setShowForm(v => !v) }}
          style={s.btnPrimary}
        >
          {showForm ? 'Cancel' : '+ Add area'}
        </button>
      </div>

      {showForm && (
        <div style={{ ...s.card, marginBottom: 20 }}>
          <h3 style={s.h3}>{editId ? 'Edit area' : 'Add area'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            <div>
              <p style={s.lbl}>Name</p>
              <input
                value={form.name}
                onChange={e => {
                  const name = e.target.value
                  setForm(f => ({ ...f, name, slug: (!editId && !slugTouched) ? slugify(name) : f.slug }))
                }}
                style={s.input}
              />
            </div>
            <div>
              <p style={s.lbl}>Slug</p>
              <input
                value={form.slug}
                onChange={e => { setSlugTouched(true); setForm(f => ({ ...f, slug: slugify(e.target.value) })) }}
                placeholder="auto from name"
                style={s.input}
              />
              <p style={{ ...s.lbl, margin: '4px 0 0', lineHeight: 1.4 }}>Fills in from the name. The location prefix and uniqueness are added automatically when you save.</p>
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
          <SignageListHint color={s.muted}>Click an area to edit.</SignageListHint>
          {areas.map(a => {
            const inArea = screens.filter(sc => sc.area_id === a.id)
            const count = inArea.length
            const meta = [
              `${count} screen${count === 1 ? '' : 's'}`,
              a.building || null,
              a.floor != null ? `Floor ${a.floor}` : null,
            ].filter(Boolean).join(' · ')
            return (
              <div key={a.id} style={{ ...s.card, padding: '12px 14px', marginBottom: 8 }}>
                <SignageRowEditButton onClick={() => startEdit(a)} textColor={s.text} fontWeight={600}>
                  {a.name}
                </SignageRowEditButton>
                <div style={{ fontSize: 12, color: s.muted, marginTop: 4 }}>{meta}</div>
                {inArea.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {inArea.map(sc => (
                      <span key={sc.id} style={{ fontSize: 11.5, padding: '2px 9px', borderRadius: 20, border: `1px solid ${s.border}`, color: s.text }}>{sc.name}</span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {!areas.length && <div style={{ color: s.muted, padding: 16, textAlign: 'center' }}>No areas yet.</div>}
        </>
      )}
    </SignagePageShell>
  )
}
