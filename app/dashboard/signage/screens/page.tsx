'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import {
  SignageDeleteButton,
  SignagePageShell,
  deleteSignageItem,
  layoutLabel,
  orientationLabel,
  useSignageAdminStyles,
} from '../components/SignageAdmin'
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
  const s = useSignageAdminStyles(theme)
  const supabase = useMemo(() => createClient(), [])
  const { areas, refreshCatalog } = useSignage()
  const [loading, setLoading] = useState(true)
  const [screens, setScreens] = useState<Screen[]>([])
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const areaName = (areaId: string | null) => areas.find(a => a.id === areaId)?.name ?? '—'

  const loadScreens = useCallback(async () => {
    const { data } = await supabase.from('signage_screens').select('*').order('code')
    setScreens(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { void loadScreens() }, [loadScreens])

  const resetForm = () => {
    setForm(empty)
    setEditId(null)
    setShowForm(false)
  }

  const save = async () => {
    const body = { ...form, area_id: form.area_id || null, floor: form.floor ? Number(form.floor) : null, building: form.building || null, wayfinding_heading: form.wayfinding_heading || null, notes: form.notes || null }
    const res = await fetch('/api/signage/screens', { method: editId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editId ? { id: editId, ...body } : body) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast(data.error || 'Save failed', 'error'); return }
    toast('Saved', 'success')
    resetForm()
    await Promise.all([loadScreens(), refreshCatalog()])
  }

  const copyUrl = (code: string) => {
    void navigator.clipboard.writeText(signageScreenUrl(code))
    toast('URL copied', 'success')
  }

  const startEdit = (sc: Screen) => {
    setEditId(sc.id)
    setForm({ ...sc, building: sc.building || '', wayfinding_heading: sc.wayfinding_heading || '', notes: sc.notes || '' })
    setShowForm(true)
  }

  return (
    <SignagePageShell title="Screens">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ ...s.h3, margin: 0 }}>Screens</h3>
        <button
          type="button"
          onClick={() => { resetForm(); setShowForm(v => !v) }}
          style={s.btn}
        >
          + Add screen
        </button>
      </div>

      {showForm && (
        <div style={{ ...s.card, marginBottom: 20 }}>
          <h3 style={s.h3}>{editId ? 'Edit screen' : 'Add screen'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            <div>
              <p style={s.lbl}>Code (URL slug)</p>
              <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} style={s.input} />
            </div>
            <div>
              <p style={s.lbl}>Display name</p>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={s.input} />
            </div>
            <div>
              <p style={s.lbl}>Area</p>
              <select value={form.area_id || ''} onChange={e => setForm(f => ({ ...f, area_id: e.target.value || null }))} style={s.input}>
                <option value="">No area</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <p style={s.lbl}>Building</p>
              <input value={form.building || ''} onChange={e => setForm(f => ({ ...f, building: e.target.value }))} style={s.input} />
            </div>
            <div>
              <p style={s.lbl}>Floor</p>
              <input type="number" value={form.floor ?? ''} onChange={e => setForm(f => ({ ...f, floor: e.target.value ? parseInt(e.target.value, 10) : null }))} style={s.input} />
            </div>
            <div>
              <p style={s.lbl}>Orientation</p>
              <select value={form.orientation} onChange={e => setForm(f => ({ ...f, orientation: e.target.value }))} style={s.input}>
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
              </select>
            </div>
            <div>
              <p style={s.lbl}>Layout</p>
              <select value={form.layout} onChange={e => setForm(f => ({ ...f, layout: e.target.value }))} style={s.input}>
                <option value="zoned">Zoned</option>
                <option value="full_bleed">Full bleed</option>
                <option value="wayfinding">Wayfinding</option>
              </select>
            </div>
            <div>
              <p style={s.lbl}>Wayfinding heading</p>
              <input value={form.wayfinding_heading || ''} onChange={e => setForm(f => ({ ...f, wayfinding_heading: e.target.value }))} style={s.input} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 18, marginTop: 12 }}>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 7, color: s.text }}>
              <input type="checkbox" checked={form.accepts_takeover} onChange={e => setForm(f => ({ ...f, accepts_takeover: e.target.checked }))} />
              Accepts live takeover
            </label>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 7, color: s.text }}>
              <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
              Active
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button type="button" onClick={resetForm} style={s.btn}>Cancel</button>
            {editId && (
              <SignageDeleteButton
                confirmMessage={`Delete screen "${form.name}" (${form.code})?`}
                onConfirm={async () => {
                  if (await deleteSignageItem('/api/signage/screens', editId)) {
                    resetForm()
                    await Promise.all([loadScreens(), refreshCatalog()])
                  }
                }}
              />
            )}
            <button type="button" onClick={() => void save()} style={s.btnPrimary}>Save</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: s.muted, padding: 16 }}>Loading screens…</div>
      ) : (
        <div style={s.cardCompact}>
          <table style={s.tbl}>
            <colgroup>
              <col style={{ width: '20%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '25%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={s.th}>Name</th>
                <th style={s.th}>Area</th>
                <th style={s.th}>Orientation</th>
                <th style={s.th}>Layout</th>
                <th style={s.th}>Takeover</th>
                <th style={s.th}>URL</th>
              </tr>
            </thead>
            <tbody>
              {screens.map(sc => (
                <tr key={sc.id}>
                  <td style={s.td}>
                    <button type="button" onClick={() => startEdit(sc)} style={{ background: 'none', border: 'none', padding: 0, color: s.text, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', textAlign: 'left' }}>
                      {sc.name}{!sc.active && <span style={{ color: s.muted }}> (inactive)</span>}
                    </button>
                  </td>
                  <td style={s.tdMuted}>{areaName(sc.area_id)}</td>
                  <td style={s.tdMuted}>{orientationLabel(sc.orientation)}</td>
                  <td style={s.tdMuted}>{layoutLabel(sc.layout)}</td>
                  <td style={s.tdMuted}>{sc.accepts_takeover ? 'Yes' : 'No'}</td>
                  <td style={{ ...s.td, fontSize: 12 }}>
                    <span style={{ color: '#9aa0ab' }}>/signage/screen/{sc.code}</span>{' '}
                    <button type="button" onClick={() => copyUrl(sc.code)} style={s.btnSmall} title="Copy full URL">⎘</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!screens.length && <div style={{ color: s.muted, padding: 16, textAlign: 'center' }}>No screens yet.</div>}
        </div>
      )}

    </SignagePageShell>
  )
}
