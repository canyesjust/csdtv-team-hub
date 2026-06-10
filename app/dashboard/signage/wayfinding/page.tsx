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

  return (
    <SignagePageShell title="Wayfinding">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ ...s.h3, margin: 0 }}>Wayfinding</h3>
        <button
          type="button"
          onClick={() => { resetForm(); setShowForm(v => !v) }}
          style={s.btn}
        >
          + Add entry
        </button>
      </div>

      <p style={{ fontSize: 13, color: s.muted, margin: '0 0 16px', lineHeight: 1.55, maxWidth: 720 }}>
        Add destinations and arrow directions for each area (e.g. “Culinary Arts → right”). Entries appear on every screen assigned to that area — below announcements on Zoned screens, or as the main directory on Wayfinding layout screens.
      </p>

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
          <div style={s.cardCompact}>
            <table style={s.tbl}>
              <colgroup>
                <col style={{ width: '32%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '12%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={s.th}>Destination</th>
                  <th style={s.th}>Area</th>
                  <th style={s.th}>Direction</th>
                  <th style={s.th}>Sort</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id}>
                    <td style={s.td}>
                      <SignageRowEditButton onClick={() => startEdit(e)} textColor={s.text}>
                        {e.destination}
                      </SignageRowEditButton>
                    </td>
                    <td style={s.tdMuted}>{areaName(e.area_id)}</td>
                    <td style={s.tdMuted}>{e.direction}</td>
                    <td style={s.tdMuted}>{e.sort_order}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!entries.length && <div style={{ color: s.muted, padding: 16, textAlign: 'center' }}>No wayfinding entries yet.</div>}
          </div>
        </>
      )}
    </SignagePageShell>
  )
}
