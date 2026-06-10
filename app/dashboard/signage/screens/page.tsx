'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { SignageDeleteButton, SignagePageShell, deleteSignageItem, useSignageTheme } from '../components/SignageAdmin'
import { useSignage } from '../components/SignageProvider'
import { signageScreenUrl } from '@/lib/signage/constants'

type Screen = {
  id: string
  code: string
  name: string
  area_id: string | null
  building: string | null
  floor: number | null
  orientation: string
  layout: string
  wayfinding_heading: string | null
  accepts_takeover: boolean
  active: boolean
  notes: string | null
}

const empty: Omit<Screen, 'id'> = {
  code: '', name: '', area_id: null, building: '', floor: null, orientation: 'landscape', layout: 'zoned',
  wayfinding_heading: '', accepts_takeover: true, active: true, notes: '',
}

export default function SignageScreensPage() {
  const { theme } = useTheme()
  const { text, muted, border, cardBg, inputBg } = useSignageTheme(theme)
  const supabase = useMemo(() => createClient(), [])
  const { areas, refreshCatalog } = useSignage()
  const [loading, setLoading] = useState(true)
  const [screens, setScreens] = useState<Screen[]>([])
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState<string | null>(null)

  const inputStyle: React.CSSProperties = {
    background: inputBg, border: `0.5px solid ${border}`, borderRadius: 10, padding: '8px 12px', fontSize: 14, color: text, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
  }

  const loadScreens = useCallback(async () => {
    const { data } = await supabase.from('signage_screens').select('*').order('code')
    setScreens(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { void loadScreens() }, [loadScreens])

  const save = async () => {
    const body = { ...form, area_id: form.area_id || null, floor: form.floor ? Number(form.floor) : null, building: form.building || null, wayfinding_heading: form.wayfinding_heading || null, notes: form.notes || null }
    const res = await fetch('/api/signage/screens', { method: editId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editId ? { id: editId, ...body } : body) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast(data.error || 'Save failed', 'error'); return }
    toast('Saved', 'success')
    setForm(empty)
    setEditId(null)
    await Promise.all([loadScreens(), refreshCatalog()])
  }

  const copyUrl = (code: string) => {
    void navigator.clipboard.writeText(signageScreenUrl(code))
    toast('URL copied', 'success')
  }

  return (
    <SignagePageShell title="Screens">
      <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 12px' }}>{editId ? 'Edit screen' : 'Add screen'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          <input placeholder="Code (URL slug)" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} style={inputStyle} />
          <input placeholder="Display name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
          <select value={form.area_id || ''} onChange={e => setForm(f => ({ ...f, area_id: e.target.value || null }))} style={inputStyle}>
            <option value="">No area</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input placeholder="Building" value={form.building || ''} onChange={e => setForm(f => ({ ...f, building: e.target.value }))} style={inputStyle} />
          <input placeholder="Floor" type="number" value={form.floor ?? ''} onChange={e => setForm(f => ({ ...f, floor: e.target.value ? parseInt(e.target.value, 10) : null }))} style={inputStyle} />
          <select value={form.orientation} onChange={e => setForm(f => ({ ...f, orientation: e.target.value }))} style={inputStyle}>
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
          </select>
          <select value={form.layout} onChange={e => setForm(f => ({ ...f, layout: e.target.value }))} style={inputStyle}>
            <option value="zoned">Zoned</option>
            <option value="full_bleed">Full bleed</option>
            <option value="wayfinding">Wayfinding</option>
          </select>
          <input placeholder="Wayfinding heading" value={form.wayfinding_heading || ''} onChange={e => setForm(f => ({ ...f, wayfinding_heading: e.target.value }))} style={inputStyle} />
        </div>
        <label style={{ display: 'flex', gap: 8, marginTop: 10, fontSize: 14, color: text }}>
          <input type="checkbox" checked={form.accepts_takeover} onChange={e => setForm(f => ({ ...f, accepts_takeover: e.target.checked }))} /> Accepts live takeover
        </label>
        <label style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 14, color: text }}>
          <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} /> Active
        </label>
        <button type="button" onClick={() => void save()} style={{ marginTop: 12, padding: '10px 18px', background: '#1e6cb5', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
      </div>
      {loading ? (
        <div style={{ color: muted, padding: 16 }}>Loading screens…</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {screens.map(s => (
            <div key={s.id} style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 600, color: text }}>{s.name} <span style={{ color: muted, fontWeight: 400 }}>({s.code})</span></div>
                <div style={{ fontSize: 13, color: muted }}>{s.layout} · {s.orientation}{!s.active ? ' · inactive' : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => copyUrl(s.code)} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${border}`, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: text }}>Copy URL</button>
                <button type="button" onClick={() => { setEditId(s.id); setForm({ ...s, building: s.building || '', wayfinding_heading: s.wayfinding_heading || '', notes: s.notes || '' }) }} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#162844', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                <SignageDeleteButton
                  confirmMessage={`Delete screen "${s.name}" (${s.code})?`}
                  onConfirm={async () => {
                    if (await deleteSignageItem('/api/signage/screens', s.id)) {
                      if (editId === s.id) {
                        setEditId(null)
                        setForm(empty)
                      }
                      await Promise.all([loadScreens(), refreshCatalog()])
                    }
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </SignagePageShell>
  )
}
