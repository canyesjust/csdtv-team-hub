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

const DIRECTIONS = ['left', 'right', 'up', 'down', 'straight'] as const

type WayfindingRow = { id: string; area_id: string; destination: string; direction: string; sort_order: number }

const emptyForm = { area_id: '', destination: '', direction: 'right', sort_order: 0 }

export default function SignageWayfindingPage() {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const supabase = useMemo(() => createClient(), [])
  const { areas, activeSiteId } = useSignage()
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<WayfindingRow[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const resetForm = () => {
    setForm(emptyForm)
    setEditId(null)
    setShowForm(false)
  }

  const load = useCallback(async () => {
    const { data } = await supabase.from('signage_wayfinding').select('id, area_id, destination, direction, sort_order').eq('site_id', activeSiteId).order('sort_order')
    setEntries(data || [])
    setLoading(false)
  }, [supabase, activeSiteId])

  useEffect(() => { void load() }, [load])

  const startEdit = (row: WayfindingRow) => {
    setEditId(row.id)
    setForm({
      area_id: row.area_id,
      destination: row.destination,
      direction: row.direction,
      sort_order: row.sort_order,
    })
    setShowForm(true)
  }

  const save = async () => {
    if (!form.area_id || !form.destination.trim()) { toast('Area and destination are required', 'error'); return }
    const res = await fetch('/api/signage/wayfinding', {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editId ? { id: editId, ...form } : { ...form, site_id: activeSiteId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast(typeof data.error === 'string' ? data.error : 'Save failed', 'error'); return }
    toast(editId ? 'Entry updated' : 'Entry added', 'success')
    resetForm()
    void load()
  }

  const areaName = (id: string) => areas.find(a => a.id === id)?.name || id
  const DIRECTION_ARROW: Record<string, string> = { left: '←', right: '→', up: '↑', down: '↓', straight: '⬆' }

  return (
    <SignagePageShell title="Wayfinding" subtitle="Directory entries & arrows for each area">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => { resetForm(); setShowForm(v => !v) }}
          style={s.btnPrimary}
        >
          {showForm ? 'Cancel' : '+ Add entry'}
        </button>
      </div>

      {showForm && (
        <div style={{ ...s.card, marginBottom: 20 }}>
          <h3 style={s.h3}>{editId ? 'Edit wayfinding entry' : 'Add wayfinding entry'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            <div>
              <p style={s.lbl}>Area</p>
              <select value={form.area_id} onChange={e => setForm(f => ({ ...f, area_id: e.target.value }))} style={s.input}>
                <option value="">Select area</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <p style={s.lbl}>Destination</p>
              <input value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} style={s.input} />
            </div>
            <div>
              <p style={s.lbl}>Direction</p>
              <select value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))} style={s.input}>
                {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
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
                confirmMessage={`Remove wayfinding entry "${form.destination}"?`}
                onConfirm={async () => {
                  if (await deleteSignageItem('/api/signage/wayfinding', editId)) {
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
          <SignageListHint color={s.muted}>Click a destination to edit.</SignageListHint>
          {entries.map(e => (
            <div key={e.id} style={{ ...s.card, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: s.infoBg, color: s.info, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }} aria-hidden>
                {DIRECTION_ARROW[e.direction] ?? '→'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <SignageRowEditButton onClick={() => startEdit(e)} textColor={s.text} fontWeight={600}>
                  {e.destination}
                </SignageRowEditButton>
                <div style={{ fontSize: 12, color: s.muted, marginTop: 4 }}>{areaName(e.area_id)} · {e.direction}</div>
              </div>
            </div>
          ))}
          {!entries.length && <div style={{ color: s.muted, padding: 16, textAlign: 'center' }}>No wayfinding entries yet.</div>}
        </>
      )}
    </SignagePageShell>
  )
}
