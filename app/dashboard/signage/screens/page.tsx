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
  formatSignageDate,
  layoutLabel,
  orientationLabel,
  useSignageAdminStyles,
} from '../components/SignageAdmin'
import { useSignage } from '../components/SignageProvider'
import { signageScreenUrl, SIGNAGE_THEMES } from '@/lib/signage/constants'
import {
  AbleSignScreenPanel,
  AbleSignStatusDot,
  AbleSignSyncAllButton,
} from '../components/AbleSignControls'

type ScreenForm = {
  code: string
  name: string
  area_id: string | null
  building: string | null
  floor: number | null
  orientation: string
  layout: string
  theme: string | null
  wayfinding_heading: string | null
  accepts_takeover: boolean
  active: boolean
  notes: string | null
}

type Screen = ScreenForm & {
  id: string
  ablesign_screen_id: number | null
  ablesign_webapp_id: number | null
  ablesign_synced_at: string | null
  ablesign_online: boolean | null
  ablesign_heartbeat_at: string | null
}

const empty: ScreenForm = {
  code: '', name: '', area_id: null, building: '', floor: null, orientation: 'landscape', layout: 'zoned',
  theme: '', wayfinding_heading: '', accepts_takeover: true, active: true, notes: '',
}

export default function SignageScreensPage() {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const supabase = useMemo(() => createClient(), [])
  const { areas, refreshCatalog } = useSignage()
  const [loading, setLoading] = useState(true)
  const [screens, setScreens] = useState<Screen[]>([])
  const [form, setForm] = useState<ScreenForm>(empty)
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
    const body = { ...form, area_id: form.area_id || null, floor: form.floor ? Number(form.floor) : null, building: form.building || null, wayfinding_heading: form.wayfinding_heading || null, notes: form.notes || null, theme: form.theme || null }
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
    setForm({
      code: sc.code,
      name: sc.name,
      area_id: sc.area_id,
      building: sc.building || '',
      floor: sc.floor,
      orientation: sc.orientation,
      layout: sc.layout,
      theme: sc.theme || '',
      wayfinding_heading: sc.wayfinding_heading || '',
      accepts_takeover: sc.accepts_takeover,
      active: sc.active,
      notes: sc.notes || '',
    })
    setShowForm(true)
  }

  const linkedScreenIds = screens.filter(sc => sc.ablesign_screen_id).map(sc => sc.id)

  return (
    <SignagePageShell title="Screens">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ ...s.h3, margin: 0 }}>Screens</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <AbleSignSyncAllButton screenIds={linkedScreenIds} onDone={() => void loadScreens()} />
          <button
            type="button"
            onClick={() => { resetForm(); setShowForm(v => !v) }}
            style={s.btn}
          >
            + Add screen
          </button>
        </div>
      </div>

      <div style={{ ...s.card, marginBottom: 16, padding: '12px 14px', background: s.infoBg, borderColor: s.infoBorder }}>
        <p style={{ margin: 0, fontSize: 13, color: s.text, lineHeight: 1.55 }}>
          Each screen has a <strong>layout</strong> (how content is arranged) and an optional <strong>area</strong> (which building zone it represents).
          Directory entries are managed on the Wayfinding page and appear on any screen linked to that area — at the bottom of the announcements column on <strong>Zoned</strong> screens, or as the main directory on <strong>Wayfinding</strong> layout screens.
        </p>
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
              <p style={{ ...s.lbl, margin: '6px 0 0', lineHeight: 1.45 }}>
                Links this screen to a zone. Wayfinding entries for that area show in the directory on this screen.
              </p>
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
                <option value="zoned">Zoned — media + announcements (+ directory if area set)</option>
                <option value="full_bleed">Full bleed — media only (hallways)</option>
                <option value="wayfinding">Wayfinding — large directory + media (entrances)</option>
              </select>
              <p style={{ ...s.lbl, margin: '6px 0 0', lineHeight: 1.45 }}>
                Zoned is the default department screen. Full bleed hides the side rail. Wayfinding dedicates most of the screen to the directory.
              </p>
            </div>
            <div>
              <p style={s.lbl}>Color theme</p>
              <select value={form.theme ?? ''} onChange={e => setForm(f => ({ ...f, theme: e.target.value }))} style={s.input}>
                <option value="">Use building default</option>
                {SIGNAGE_THEMES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {form.layout === 'wayfinding' && (
              <div>
                <p style={s.lbl}>Wayfinding heading</p>
                <input
                  value={form.wayfinding_heading || ''}
                  onChange={e => setForm(f => ({ ...f, wayfinding_heading: e.target.value }))}
                  placeholder="e.g. Find your way around Main Hall"
                  style={s.input}
                />
                <p style={{ ...s.lbl, margin: '6px 0 0', lineHeight: 1.45 }}>
                  Optional rotating title at the top of <strong>Wayfinding</strong> layout screens only. Cycles with visitor welcomes and a default “Find your way…” message. Not used on Zoned screens (they show the area name instead).
                </p>
              </div>
            )}
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
          {editId && (
            <AbleSignScreenPanel
              screen={{
                id: editId,
                name: form.name,
                code: form.code,
                ablesign_screen_id: screens.find(sc => sc.id === editId)?.ablesign_screen_id ?? null,
                ablesign_webapp_id: screens.find(sc => sc.id === editId)?.ablesign_webapp_id ?? null,
                ablesign_synced_at: screens.find(sc => sc.id === editId)?.ablesign_synced_at ?? null,
                ablesign_online: screens.find(sc => sc.id === editId)?.ablesign_online ?? null,
                ablesign_heartbeat_at: screens.find(sc => sc.id === editId)?.ablesign_heartbeat_at ?? null,
              }}
              onUpdated={() => void loadScreens()}
            />
          )}
        </div>
      )}

      {loading ? (
        <div style={{ color: s.muted, padding: 16 }}>Loading screens…</div>
      ) : (
        <>
          <SignageListHint color={s.muted} />
          <div style={s.cardCompact}>
          <table style={s.tbl}>
            <colgroup>
              <col style={{ width: '18%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '24%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={s.th}>Name</th>
                <th style={s.th}>Area</th>
                <th style={s.th}>Orientation</th>
                <th style={s.th}>Layout</th>
                <th style={s.th}>AbleSign</th>
                <th style={s.th}>Takeover</th>
                <th style={s.th}>URL</th>
              </tr>
            </thead>
            <tbody>
              {screens.map(sc => (
                <tr key={sc.id}>
                  <td style={s.td}>
                    <SignageRowEditButton onClick={() => startEdit(sc)} textColor={s.text}>
                      {sc.name}{!sc.active && <span style={{ color: s.muted }}> (inactive)</span>}
                    </SignageRowEditButton>
                  </td>
                  <td style={s.tdMuted}>{areaName(sc.area_id)}</td>
                  <td style={s.tdMuted}>{orientationLabel(sc.orientation)}</td>
                  <td style={s.tdMuted}>{layoutLabel(sc.layout)}</td>
                  <td style={s.td}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <AbleSignStatusDot online={sc.ablesign_screen_id ? sc.ablesign_online : null} />
                      {sc.ablesign_screen_id
                        ? (
                          <>
                            {sc.ablesign_online ? 'Online' : 'Offline'}
                            {sc.ablesign_synced_at && (
                              <span style={{ color: s.muted }}> · {formatSignageDate(sc.ablesign_synced_at)}</span>
                            )}
                          </>
                        )
                        : <span style={{ color: s.muted }}>Not linked</span>}
                    </span>
                  </td>
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
        </>
      )}

    </SignagePageShell>
  )
}
