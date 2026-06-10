'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { SignageDeleteButton, SignageEditButton, SignagePageShell, deleteSignageItem, useSignageTheme } from '../components/SignageAdmin'
import { useSignage } from '../components/SignageProvider'

const DIRECTIONS = ['left', 'right', 'up', 'down', 'straight'] as const

type WayfindingRow = { id: string; area_id: string; destination: string; direction: string; sort_order: number }

const emptyForm = { area_id: '', destination: '', direction: 'right', sort_order: 0 }

export default function SignageWayfindingPage() {
  const { theme } = useTheme()
  const { text, muted, border, cardBg, inputBg } = useSignageTheme(theme)
  const supabase = useMemo(() => createClient(), [])
  const { areas } = useSignage()
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<WayfindingRow[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)
  const inputStyle: React.CSSProperties = { background: inputBg, border: `0.5px solid ${border}`, borderRadius: 10, padding: '8px 12px', fontSize: 14, color: text, fontFamily: 'inherit' }

  const resetForm = () => {
    setForm(emptyForm)
    setEditId(null)
  }

  const load = useCallback(async () => {
    const { data } = await supabase.from('signage_wayfinding').select('id, area_id, destination, direction, sort_order').order('sort_order')
    setEntries(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { void load() }, [load])

  const startEdit = (row: WayfindingRow) => {
    setEditId(row.id)
    setForm({
      area_id: row.area_id,
      destination: row.destination,
      direction: row.direction,
      sort_order: row.sort_order,
    })
  }

  const save = async () => {
    if (!form.area_id || !form.destination.trim()) { toast('Area and destination are required', 'error'); return }
    const res = await fetch('/api/signage/wayfinding', {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editId ? { id: editId, ...form } : form),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast(typeof data.error === 'string' ? data.error : 'Save failed', 'error'); return }
    toast(editId ? 'Entry updated' : 'Entry added', 'success')
    resetForm()
    void load()
  }

  const areaName = (id: string) => areas.find(a => a.id === id)?.name || id

  return (
    <SignagePageShell title="Wayfinding">
      <p style={{ fontSize: 13, color: muted, margin: '0 0 16px', lineHeight: 1.55, maxWidth: 720 }}>
        Add destinations and arrow directions for each area (e.g. “Culinary Arts → right”). Entries appear on every screen assigned to that area — below announcements on Zoned screens, or as the main directory on Wayfinding layout screens.
      </p>
      <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 16, marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 12px', color: text }}>{editId ? 'Edit wayfinding entry' : 'Add wayfinding entry'}</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={form.area_id} onChange={e => setForm(f => ({ ...f, area_id: e.target.value }))} style={inputStyle}>
            <option value="">Select area</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input placeholder="Destination" value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} style={inputStyle} />
          <select value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))} style={inputStyle}>
            {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <input type="number" placeholder="Sort order" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value, 10) || 0 }))} style={{ ...inputStyle, width: 100 }} />
          <button type="button" onClick={() => void save()} style={{ padding: '8px 16px', background: '#1e6cb5', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>{editId ? 'Update' : 'Add'}</button>
          {editId && (
            <button type="button" onClick={resetForm} style={{ padding: '8px 16px', background: 'transparent', color: text, border: `1px solid ${border}`, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          )}
        </div>
      </div>
      {loading ? (
        <div style={{ color: muted, padding: 16 }}>Loading…</div>
      ) : (
        entries.map(e => (
          <div key={e.id} style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 14, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ color: text }}>{areaName(e.area_id)} — {e.destination} ({e.direction}) · order {e.sort_order}</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <SignageEditButton onClick={() => startEdit(e)} />
              <SignageDeleteButton
                confirmMessage={`Remove wayfinding entry "${e.destination}"?`}
                onConfirm={async () => {
                  if (await deleteSignageItem('/api/signage/wayfinding', e.id)) {
                    if (editId === e.id) resetForm()
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
