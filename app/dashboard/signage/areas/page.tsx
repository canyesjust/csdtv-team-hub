'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { SignageDeleteButton, SignagePageShell, deleteSignageItem, useSignageTheme } from '../components/SignageAdmin'
import { useSignage } from '../components/SignageProvider'

type Area = { id: string; name: string; slug: string; building: string | null; floor: number | null; sort_order: number }

export default function SignageAreasPage() {
  const { theme } = useTheme()
  const { text, border, cardBg, inputBg } = useSignageTheme(theme)
  const supabase = useMemo(() => createClient(), [])
  const { refreshCatalog } = useSignage()
  const [loading, setLoading] = useState(true)
  const [areas, setAreas] = useState<Area[]>([])
  const [form, setForm] = useState({ name: '', slug: '', building: '', floor: '', sort_order: 0 })
  const [editId, setEditId] = useState<string | null>(null)
  const inputStyle: React.CSSProperties = { background: inputBg, border: `0.5px solid ${border}`, borderRadius: 10, padding: '8px 12px', fontSize: 14, color: text, fontFamily: 'inherit' }

  const load = useCallback(async () => {
    const { data } = await supabase.from('signage_areas').select('*').order('sort_order')
    setAreas(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    const body = { name: form.name, slug: form.slug, building: form.building || null, floor: form.floor ? parseInt(form.floor, 10) : null, sort_order: form.sort_order }
    const res = await fetch('/api/signage/areas', { method: editId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editId ? { id: editId, ...body } : body) })
    if (!res.ok) { toast('Save failed', 'error'); return }
    toast('Saved', 'success')
    setForm({ name: '', slug: '', building: '', floor: '', sort_order: 0 })
    setEditId(null)
    await Promise.all([load(), refreshCatalog()])
  }

  return (
    <SignagePageShell title="Areas">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <input placeholder="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
        <input placeholder="Slug" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} style={inputStyle} />
        <input placeholder="Building" value={form.building} onChange={e => setForm(f => ({ ...f, building: e.target.value }))} style={inputStyle} />
        <input placeholder="Floor" value={form.floor} onChange={e => setForm(f => ({ ...f, floor: e.target.value }))} style={{ ...inputStyle, width: 80 }} />
        <button type="button" onClick={() => void save()} style={{ padding: '8px 16px', background: '#1e6cb5', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>{editId ? 'Update' : 'Add'}</button>
      </div>
      {loading ? (
        <div style={{ color: '#6b7280', padding: 16 }}>Loading areas…</div>
      ) : (
        areas.map(a => (
          <div key={a.id} style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 14, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span>{a.name} ({a.slug}) — {a.building || '—'} floor {a.floor ?? '—'}</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" onClick={() => { setEditId(a.id); setForm({ name: a.name, slug: a.slug, building: a.building || '', floor: a.floor != null ? String(a.floor) : '', sort_order: a.sort_order }) }} style={{ border: 'none', background: 'transparent', color: '#1e6cb5', cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
              <SignageDeleteButton
                confirmMessage={`Delete area "${a.name}"? Screens in this area will lose their area link.`}
                onConfirm={async () => {
                  if (await deleteSignageItem('/api/signage/areas', a.id)) {
                    if (editId === a.id) {
                      setEditId(null)
                      setForm({ name: '', slug: '', building: '', floor: '', sort_order: 0 })
                    }
                    await Promise.all([load(), refreshCatalog()])
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
