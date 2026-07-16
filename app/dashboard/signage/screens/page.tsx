'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import {
  SignageDeleteButton,
  SignageListHint,
  SignagePageShell,
  deleteSignageItem,
  layoutLabel,
  useSignageAdminStyles,
} from '../components/SignageAdmin'
import { useSignage } from '../components/SignageProvider'
import { SignagePushStatus } from '../components/SignagePushStatus'
import { signageScreenUrl, SIGNAGE_THEMES } from '@/lib/signage/constants'
import {
  AbleSignScreenPanel,
  AbleSignSyncAllButton,
  AbleSignPushAllHtmlButton,
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
  webpage_url: string | null
  accepts_takeover: boolean
  board_takeover_enabled: boolean
  board_takeover_audio: boolean
  active: boolean
  notes: string | null
}

type Screen = ScreenForm & {
  id: string
  ablesign_screen_id: number | null
  ablesign_webapp_id: number | null
  ablesign_html_webapp_id: number | null
  ablesign_html_dirty_at: string | null
  ablesign_synced_at: string | null
  ablesign_online: boolean | null
  ablesign_heartbeat_at: string | null
}

type AssignedItem = {
  id: string
  title: string | null
  type?: string
  system_kind?: string | null
  all_screens: boolean
  target_area_ids: string[] | null
  target_screen_ids: string[] | null
  target_buildings?: string[] | null
  start_date: string | null
  end_date: string | null
  active?: boolean
  pending?: boolean
}

const empty: ScreenForm = {
  code: '', name: '', area_id: null, building: '', floor: null, orientation: 'landscape', layout: 'inherit',
  theme: '', wayfinding_heading: '', webpage_url: '', accepts_takeover: true, board_takeover_enabled: false, board_takeover_audio: false, active: true, notes: '',
}

export default function SignageScreensPage() {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const supabase = useMemo(() => createClient(), [])
  const { areas, refreshCatalog, activeSiteId } = useSignage()
  const [loading, setLoading] = useState(true)
  const [screens, setScreens] = useState<Screen[]>([])
  const [form, setForm] = useState<ScreenForm>(empty)
  const [editId, setEditId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [creatingArea, setCreatingArea] = useState(false)
  const [newAreaName, setNewAreaName] = useState('')
  const [savingArea, setSavingArea] = useState(false)
  const [assigned, setAssigned] = useState<{ content: AssignedItem[]; anns: AssignedItem[] } | null>(null)

  const areaName = (areaId: string | null) => areas.find(a => a.id === areaId)?.name ?? '—'

  const loadScreens = useCallback(async () => {
    if (!activeSiteId) { setScreens([]); setLoading(false); return }
    const { data } = await supabase.from('signage_screens').select('*').eq('site_id', activeSiteId).order('code')
    setScreens(data || [])
    setLoading(false)
  }, [supabase, activeSiteId])

  useEffect(() => { void loadScreens() }, [loadScreens])

  // Load what content + announcements currently target the screen being edited,
  // so the editor shows "what's on this screen" — not just its config.
  useEffect(() => {
    if (!editId || !activeSiteId) { setAssigned(null); return }
    const sc = screens.find(x => x.id === editId)
    if (!sc) { setAssigned(null); return }
    let cancelled = false
    void (async () => {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
      const [c, a] = await Promise.all([
        supabase.from('signage_content').select('id, title, type, system_kind, all_screens, target_area_ids, target_screen_ids, target_buildings, start_date, end_date').eq('site_id', activeSiteId).eq('status', 'approved'),
        supabase.from('signage_announcements').select('id, title, all_screens, target_area_ids, target_screen_ids, start_date, end_date, active, pending').eq('site_id', activeSiteId),
      ])
      if (cancelled) return
      const matches = (r: AssignedItem) =>
        r.all_screens ||
        (Array.isArray(r.target_screen_ids) && r.target_screen_ids.includes(sc.id)) ||
        (Array.isArray(r.target_area_ids) && !!sc.area_id && r.target_area_ids.includes(sc.area_id)) ||
        (Array.isArray(r.target_buildings) && !!sc.building && r.target_buildings.includes(sc.building))
      const inRange = (r: AssignedItem) =>
        (!r.start_date || r.start_date.slice(0, 10) <= today) && (!r.end_date || r.end_date.slice(0, 10) >= today)
      const content = ((c.data ?? []) as AssignedItem[]).filter(r => matches(r) && inRange(r))
      const anns = ((a.data ?? []) as AssignedItem[]).filter(r => !r.pending && r.active && matches(r) && inRange(r))
      setAssigned({ content, anns })
    })()
    return () => { cancelled = true }
  }, [editId, activeSiteId, screens, supabase])

  const resetForm = () => {
    setForm(empty)
    setEditId(null)
    setShowForm(false)
    setCreatingArea(false)
    setNewAreaName('')
  }

  // Create a new area inline from the screen form, then link this screen to it.
  // Reuses the areas endpoint, which owns slug generation + uniqueness.
  const createArea = async () => {
    const name = newAreaName.trim()
    if (!name) { toast('Area name is required', 'error'); return }
    setSavingArea(true)
    try {
      const res = await fetch('/api/signage/areas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, site_id: activeSiteId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(data.error || 'Could not create area', 'error'); return }
      await refreshCatalog()
      setForm(f => ({ ...f, area_id: data.area?.id ?? null }))
      setCreatingArea(false)
      setNewAreaName('')
      toast('Area created', 'success')
    } finally {
      setSavingArea(false)
    }
  }

  const save = async () => {
    const body = { ...form, area_id: form.area_id || null, floor: form.floor ? Number(form.floor) : null, building: form.building || null, wayfinding_heading: form.wayfinding_heading || null, webpage_url: form.webpage_url?.trim() || null, notes: form.notes || null, theme: form.theme || null, site_id: activeSiteId }
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
      webpage_url: sc.webpage_url || '',
      accepts_takeover: sc.accepts_takeover,
      board_takeover_enabled: sc.board_takeover_enabled,
      board_takeover_audio: sc.board_takeover_audio,
      active: sc.active,
      notes: sc.notes || '',
    })
    setShowForm(true)
  }

  const linkedScreenIds = screens.filter(sc => sc.ablesign_screen_id).map(sc => sc.id)

  return (
    <SignagePageShell title="Screens" subtitle="The physical displays around the building">
      <SignagePushStatus />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <AbleSignPushAllHtmlButton onDone={() => void loadScreens()} />
        <button
          type="button"
          onClick={() => { resetForm(); setShowForm(v => !v) }}
          style={s.btnPrimary}
        >
          {showForm ? 'Cancel' : '+ Add screen'}
        </button>
      </div>

      <details style={{ marginBottom: 16 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12.5, color: s.muted, listStyle: 'revert' }}>Advanced</summary>
        <div style={{ margin: '10px 0 0', maxWidth: 760 }}>
          <p style={{ margin: '0 0 10px', fontSize: 12.5, color: s.muted, lineHeight: 1.55 }}>
            <strong style={{ color: s.text }}>Point all at live URL (not offline).</strong> This switches every screen to the live web page instead of the downloaded HTML. Screens will go blank if the network drops. Only use this to deliberately move screens off the offline HTML — normal updates go through <strong style={{ color: s.text }}>Regenerate &amp; push HTML to all</strong> above.
          </p>
          <AbleSignSyncAllButton screenIds={linkedScreenIds} onDone={() => void loadScreens()} />
        </div>
      </details>

      <details style={{ marginBottom: 16 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12.5, color: s.muted, listStyle: 'revert' }}>How screens work</summary>
        <p style={{ margin: '8px 0 0', fontSize: 12.5, color: s.muted, lineHeight: 1.55, maxWidth: 760 }}>
          Each screen has a <strong style={{ color: s.text }}>layout</strong> (how content is arranged) and an optional <strong style={{ color: s.text }}>area</strong> (which building zone it represents).
          Directory entries are managed on the Wayfinding page and appear on any screen linked to that area — at the bottom of the announcements column on <strong style={{ color: s.text }}>Zoned</strong> screens, or as the main directory on <strong style={{ color: s.text }}>Wayfinding</strong> layout screens.
        </p>
      </details>

      {showForm && (
        <div style={{ ...s.card, marginBottom: 20 }}>
          <h3 style={s.h3}>{editId ? 'Edit screen' : 'Add screen'}</h3>

          {editId && assigned && (
            <div style={{ border: `1px solid ${s.infoBorder || s.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 16, background: s.infoBg }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: s.text, marginBottom: 8 }}>On this screen now</div>
              {assigned.content.length === 0 && assigned.anns.length === 0 ? (
                <div style={{ fontSize: 12.5, color: s.muted, lineHeight: 1.5 }}>Nothing is targeted to this screen yet. On the <strong style={{ color: s.text }}>Content</strong> page, pick this screen in a piece&rsquo;s targeting to assign it here.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {assigned.content.map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: s.text }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: s.info, minWidth: 46 }}>{c.system_kind ? 'Block' : c.type === 'video' ? 'Video' : c.type === 'html' ? 'Slide' : 'Image'}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title || 'Untitled'}</span>
                      {c.all_screens && <span style={{ fontSize: 11, color: s.muted }}>· all screens</span>}
                    </div>
                  ))}
                  {assigned.anns.map(a => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: s.text }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: s.info, minWidth: 46 }}>Notice</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                      {a.all_screens && <span style={{ fontSize: 11, color: s.muted }}>· all screens</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
              {creatingArea ? (
                <>
                  <input
                    value={newAreaName}
                    onChange={e => setNewAreaName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void createArea() } }}
                    placeholder="New area name"
                    autoFocus
                    style={s.input}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button type="button" onClick={() => void createArea()} disabled={savingArea} style={s.btnPrimary}>
                      {savingArea ? 'Creating…' : 'Create area'}
                    </button>
                    <button type="button" onClick={() => { setCreatingArea(false); setNewAreaName('') }} disabled={savingArea} style={s.btn}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <select
                  value={form.area_id || ''}
                  onChange={e => {
                    if (e.target.value === '__new') { setCreatingArea(true); return }
                    setForm(f => ({ ...f, area_id: e.target.value || null }))
                  }}
                  style={s.input}
                >
                  <option value="">No area</option>
                  {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  <option value="__new">+ New area…</option>
                </select>
              )}
              <p style={{ ...s.lbl, margin: '6px 0 0', lineHeight: 1.45 }}>
                Links this screen to an area. Wayfinding entries for that area show in the directory on this screen.
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
                <option value="inherit">Inherit from site template</option>
                <option value="zoned">Zoned — media + announcements (+ directory if area set)</option>
                <option value="zoned2">Zoned 2 — district-branded (big 16:9, weather, spotlight, news band)</option>
                <option value="full_bleed">Full bleed — media only (hallways)</option>
                <option value="wayfinding">Wayfinding — large directory + media (entrances)</option>
                <option value="webpage">Web address — one live web page, full screen</option>
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
            {form.layout === 'webpage' && (
              <div>
                <p style={s.lbl}>Web address</p>
                <input
                  value={form.webpage_url || ''}
                  onChange={e => setForm(f => ({ ...f, webpage_url: e.target.value }))}
                  placeholder="https://www.csdtvstaff.org/signage?k=…"
                  style={s.input}
                />
                <p style={{ ...s.lbl, margin: '6px 0 0', lineHeight: 1.45 }}>
                  The screen shows only this page, edge to edge — no header, ticker, or announcements. The page must allow embedding (some sites block it).
                </p>
              </div>
            )}
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
          <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 7, color: s.text }}>
              <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
              Active
            </label>
          </div>
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: s.muted, listStyle: 'revert' }}>Takeover options</summary>
            <div style={{ display: 'flex', gap: 18, marginTop: 10, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 7, color: s.text }}>
                <input type="checkbox" checked={form.accepts_takeover} onChange={e => setForm(f => ({ ...f, accepts_takeover: e.target.checked }))} />
                Accepts live takeover
              </label>
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 7, color: s.text }}>
                <input type="checkbox" checked={form.board_takeover_enabled} onChange={e => setForm(f => ({ ...f, board_takeover_enabled: e.target.checked }))} />
                Board meeting takeover
              </label>
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 7, color: s.text }}>
                <input type="checkbox" checked={form.board_takeover_audio} onChange={e => setForm(f => ({ ...f, board_takeover_audio: e.target.checked }))} />
                Play board audio
              </label>
            </div>
          </details>
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
            <details style={{ marginTop: 18, borderTop: `1px solid ${s.border}`, paddingTop: 14 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: s.muted, listStyle: 'revert' }}>AbleSign sync &amp; player</summary>
            <div style={{ marginTop: 12 }}>
            <AbleSignScreenPanel
              screen={{
                id: editId,
                name: form.name,
                code: form.code,
                ablesign_screen_id: screens.find(sc => sc.id === editId)?.ablesign_screen_id ?? null,
                ablesign_webapp_id: screens.find(sc => sc.id === editId)?.ablesign_webapp_id ?? null,
                ablesign_html_webapp_id: screens.find(sc => sc.id === editId)?.ablesign_html_webapp_id ?? null,
                ablesign_html_dirty_at: screens.find(sc => sc.id === editId)?.ablesign_html_dirty_at ?? null,
                ablesign_synced_at: screens.find(sc => sc.id === editId)?.ablesign_synced_at ?? null,
                ablesign_online: screens.find(sc => sc.id === editId)?.ablesign_online ?? null,
                ablesign_heartbeat_at: screens.find(sc => sc.id === editId)?.ablesign_heartbeat_at ?? null,
              }}
              onUpdated={() => void loadScreens()}
              siteId={activeSiteId}
            />
            </div>
            </details>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ color: s.muted, padding: 16 }}>Loading screens…</div>
      ) : !screens.length ? (
        <div style={{ color: s.muted, padding: 16, textAlign: 'center' }}>No screens at this location yet.</div>
      ) : (
        <>
          <SignageListHint color={s.muted}>Click a screen to edit. Each tile shows what&rsquo;s on it right now.</SignageListHint>
          <div className="sig-screen-tiles">
            {screens.map(sc => {
              const selected = editId === sc.id
              const linked = !!sc.ablesign_screen_id
              const online = linked ? sc.ablesign_online : null
              // Distinguish "not linked" (no AbleSign screen) from "linked but status
              // not fetched yet" — the latter is Checking, not Not linked.
              const statusText = !linked ? 'Not linked' : online === true ? 'Online' : online === false ? 'Offline' : 'Checking…'
              const pillBg = !linked ? 'rgba(2,12,22,0.7)' : online === true ? 'rgba(22,128,87,0.95)' : online === false ? 'rgba(200,52,45,0.96)' : 'rgba(150,110,20,0.92)'
              const meta = [areaName(sc.area_id), layoutLabel(sc.layout)].filter(v => v && v !== '—').join(' · ')
              return (
                <div key={sc.id} style={{ ...s.card, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', ...(selected ? { border: '2px solid #2a7fb8' } : {}) }}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Edit ${sc.name}`}
                    onClick={() => startEdit(sc)}
                    onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); startEdit(sc) } }}
                    style={{ position: 'relative', aspectRatio: '16 / 9', background: '#04263f', cursor: 'pointer', overflow: 'hidden' }}
                  >
                    <iframe src={signageScreenUrl(sc.code)} title={sc.name} loading="lazy" scrolling="no" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, pointerEvents: 'none' }} />
                    {!sc.active && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(2,12,22,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cdd8ea', fontSize: 12, fontWeight: 600 }}>Inactive</div>
                    )}
                    <span style={{ position: 'absolute', top: 6, left: 6, display: 'inline-flex', alignItems: 'center', gap: 5, background: pillBg, borderRadius: 20, padding: '3px 9px', fontSize: 10.5, fontWeight: 600, letterSpacing: 0.2, color: '#fff' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', opacity: 0.9 }} />{statusText}
                    </span>
                  </div>
                  <div style={{ padding: '8px 11px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <button type="button" onClick={() => startEdit(sc)} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: s.text, fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>{sc.name}</button>
                      <div style={{ fontSize: 11.5, color: s.muted, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta || `/${sc.code}`}</div>
                    </div>
                    <button type="button" onClick={() => copyUrl(sc.code)} style={s.btnSmall} title="Copy full URL">Copy</button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <style>{`
        .sig-screen-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
      `}</style>
    </SignagePageShell>
  )
}
