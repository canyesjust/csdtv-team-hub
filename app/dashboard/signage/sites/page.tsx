'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import {
  SignageDeleteButton,
  SignagePageShell,
  useSignageAdminStyles,
} from '../components/SignageAdmin'
import { useSignage } from '../components/SignageProvider'
import { SIGNAGE_THEMES } from '@/lib/signage/constants'

type School = { code: string; name: string; primary_color: string | null; secondary_color: string | null; accent_color: string | null; text_color: string | null }
type TeamMember = { id: string; name: string | null; role: string; signage_approver: boolean }
type SiteRow = {
  id: string
  name: string
  slug: string
  school_code: string | null
  use_brand_colors: boolean
  ablesign_workspace_id: string | null
  center_name: string
  weather_lat: number
  weather_lon: number
  ticker_extra: string | null
  default_theme: string
  bg_color: string | null
  panel_color: string | null
  accent_color: string | null
  text_color: string | null
  sort_order: number
  active: boolean
}

const EMPTY: Omit<SiteRow, 'id'> = {
  name: '', slug: '', school_code: null, use_brand_colors: false, ablesign_workspace_id: '',
  center_name: 'Canyons School District', weather_lat: 40.5649, weather_lon: -111.8389, ticker_extra: '',
  default_theme: 'primary', bg_color: null, panel_color: null, accent_color: null, text_color: null,
  sort_order: 0, active: true,
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export default function SignageSitesPage() {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const supabase = useMemo(() => createClient(), [])
  const { refreshSites } = useSignage()

  const [sites, setSites] = useState<SiteRow[]>([])
  const [schools, setSchools] = useState<School[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [accessIds, setAccessIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<Omit<SiteRow, 'id'>>(EMPTY)
  const [editId, setEditId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  type AsStatus = { state: 'loading' | 'ok' | 'error'; screens?: number; error?: string }
  const [asStatus, setAsStatus] = useState<Record<string, AsStatus>>({})
  const asCheckedRef = useRef(false)

  const checkAbleSign = useCallback(async (list: SiteRow[]) => {
    if (list.length === 0) return
    setAsStatus(Object.fromEntries(list.map(si => [si.id, { state: 'loading' as const }])))
    await Promise.all(list.map(async si => {
      try {
        const res = await fetch(`/api/signage/ablesign/test?siteId=${si.id}`)
        const data = await res.json().catch(() => ({}))
        setAsStatus(prev => ({
          ...prev,
          [si.id]: res.ok && data.connected
            ? { state: 'ok', screens: data.totalScreens }
            : { state: 'error', error: data.error || 'Not connected' },
        }))
      } catch {
        setAsStatus(prev => ({ ...prev, [si.id]: { state: 'error', error: 'Test failed' } }))
      }
    }))
  }, [])

  const load = useCallback(async () => {
    const [siteRes, schoolRes, teamRes] = await Promise.all([
      supabase.from('signage_sites').select('*').order('sort_order'),
      supabase.from('schools').select('code, name, primary_color, secondary_color, accent_color, text_color').eq('active', true).order('name'),
      supabase.from('team').select('id, name, role, signage_approver').eq('active', true).order('name'),
    ])
    setSites((siteRes.data as SiteRow[]) || [])
    setSchools((schoolRes.data as School[]) || [])
    setTeam((teamRes.data as TeamMember[]) || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { void load() }, [load])

  // Auto-check AbleSign connectivity once, after sites first load.
  useEffect(() => {
    if (loading || asCheckedRef.current || sites.length === 0) return
    asCheckedRef.current = true
    void checkAbleSign(sites)
  }, [loading, sites, checkAbleSign])

  const loadColorsFromSchool = () => {
    const school = schools.find(sc => sc.code === form.school_code)
    if (!school) { toast('Pick a school first', 'error'); return }
    setForm(f => ({
      ...f,
      use_brand_colors: true,
      bg_color: school.primary_color || f.bg_color,
      panel_color: school.secondary_color || null,
      accent_color: school.accent_color || f.accent_color,
      text_color: school.text_color || null,
    }))
    toast(`Loaded ${school.name} colors`, 'success')
  }

  const startEdit = async (site: SiteRow) => {
    setEditId(site.id)
    setForm({ ...site })
    setShowForm(true)
    setAccessIds([])
    const res = await fetch(`/api/signage/sites/access?siteId=${site.id}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) setAccessIds(data.teamIds || [])
  }

  const resetForm = () => { setForm(EMPTY); setEditId(null); setShowForm(false); setAccessIds([]) }

  const toggleAccess = (id: string) => {
    setAccessIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  }

  const save = async () => {
    if (!form.name.trim()) { toast('Name is required', 'error'); return }
    const body = { ...form, slug: form.slug.trim() || slugify(form.name) }
    const res = await fetch('/api/signage/sites', {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editId ? { id: editId, ...body } : body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast(data.error || 'Save failed', 'error'); return }
    // Persist per-site access when editing an existing site.
    const savedId = editId || data.site?.id
    if (savedId) {
      await fetch('/api/signage/sites/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id: savedId, team_ids: accessIds }),
      })
    }
    toast('Saved', 'success')
    resetForm()
    await Promise.all([load(), refreshSites()])
  }

  const colorRow = (label: string, key: 'bg_color' | 'panel_color' | 'accent_color' | 'text_color', fallback: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 13, color: s.text, width: 90 }}>{label}</span>
      <input
        type="color"
        value={form[key] || fallback}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        style={{ width: 40, height: 30, border: 'none', background: 'none', cursor: 'pointer' }}
      />
      <input
        value={form[key] || ''}
        placeholder={key === 'panel_color' || key === 'text_color' ? 'auto' : fallback}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value || null }))}
        style={{ ...s.input, width: 120, fontFamily: 'ui-monospace, monospace' }}
      />
      {form[key] && (
        <button type="button" onClick={() => setForm(f => ({ ...f, [key]: null }))} style={{ ...s.btnSmall }}>Clear</button>
      )}
    </div>
  )

  return (
    <SignagePageShell title="Sites & locations" subtitle="Each location is its own signage workspace">
      <div style={{ ...s.card, marginBottom: 16, borderLeft: '3px solid #d97706', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} aria-hidden>ⓘ</span>
        <div style={{ fontSize: 12.5, color: s.muted, lineHeight: 1.5 }}>
          <span style={{ color: s.text, fontWeight: 600 }}>Office signage submissions live outside this tool.</span>{' '}
          The <a href="/dashboard/signage-submissions" style={{ color: s.info, textDecoration: 'none' }}>Office signage</a> approval queue is a separate workflow. Eventually it could be folded in here as another location so there&apos;s one approval queue.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <a href="/dashboard/signage/sites/new" style={{ ...s.btnPrimary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
          + Add a school
        </a>
        <button type="button" onClick={() => { setForm(EMPTY); setEditId(null); setShowForm(v => !v) }} style={s.btn}>
          {showForm && !editId ? 'Close' : 'New location (manual)'}
        </button>
      </div>

      {showForm && (
        <div style={{ ...s.card, marginBottom: 20, display: 'grid', gap: 12, maxWidth: 560 }}>
          <h3 style={s.h3}>{editId ? 'Edit location' : 'New location'}</h3>
          <div>
            <p style={s.lbl}>Name</p>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={s.input} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <p style={s.lbl}>Slug (URL id)</p>
              <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder={slugify(form.name) || 'auto'} style={s.input} />
            </div>
            <div>
              <p style={s.lbl}>Center name (shown on screens)</p>
              <input value={form.center_name} onChange={e => setForm(f => ({ ...f, center_name: e.target.value }))} style={s.input} />
            </div>
          </div>

          <div>
            <p style={s.lbl}>Brand colors from school</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={form.school_code || ''} onChange={e => setForm(f => ({ ...f, school_code: e.target.value || null }))} style={{ ...s.input, width: 'auto', minWidth: 200 }}>
                <option value="">— no school link —</option>
                {schools.map(sc => <option key={sc.code} value={sc.code}>{sc.name}</option>)}
              </select>
              <button type="button" onClick={loadColorsFromSchool} style={s.btn}>Load colors from school</button>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: s.text }}>
            <input type="checkbox" checked={form.use_brand_colors} onChange={e => setForm(f => ({ ...f, use_brand_colors: e.target.checked }))} />
            Use these custom colors (otherwise use the theme below)
          </label>

          {form.use_brand_colors && (
            <div style={{ display: 'grid', gap: 8, padding: '10px 0' }}>
              {colorRow('Background', 'bg_color', '#162844')}
              {colorRow('Panels', 'panel_color', '#1e3649')}
              {colorRow('Accent', 'accent_color', '#96b7c8')}
              {colorRow('Text', 'text_color', '#fefefe')}
              <p style={{ fontSize: 12, color: s.muted, margin: 0 }}>Panels and Text left blank are derived automatically. Very light backgrounds are auto-darkened so white text stays readable.</p>
            </div>
          )}

          <div>
            <p style={s.lbl}>Default theme (when not using custom colors)</p>
            <select value={form.default_theme} onChange={e => setForm(f => ({ ...f, default_theme: e.target.value }))} style={s.input}>
              {SIGNAGE_THEMES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <p style={s.lbl}>Weather latitude</p>
              <input type="number" step="0.0001" value={form.weather_lat} onChange={e => setForm(f => ({ ...f, weather_lat: parseFloat(e.target.value) }))} style={s.input} />
            </div>
            <div>
              <p style={s.lbl}>Weather longitude</p>
              <input type="number" step="0.0001" value={form.weather_lon} onChange={e => setForm(f => ({ ...f, weather_lon: parseFloat(e.target.value) }))} style={s.input} />
            </div>
          </div>

          <div>
            <p style={s.lbl}>AbleSign workspace ID</p>
            <input value={form.ablesign_workspace_id || ''} onChange={e => setForm(f => ({ ...f, ablesign_workspace_id: e.target.value }))} style={s.input} />
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div>
              <p style={s.lbl}>Sort order</p>
              <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value, 10) || 0 }))} style={{ ...s.input, width: 90 }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: s.text, marginTop: 18 }}>
              <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
              Active
            </label>
          </div>

          <div>
            <p style={s.lbl}>Who can manage this site (non-managers)</p>
            <p style={{ fontSize: 12, color: s.muted, margin: '0 0 8px' }}>Managers always see every site. People listed here see only the sites they&apos;re granted.</p>
            <div style={{ display: 'grid', gap: 4, maxHeight: 180, overflowY: 'auto', border: `1px solid ${s.border}`, borderRadius: 8, padding: 8 }}>
              {team.filter(m => m.role !== 'Manager').length === 0 && (
                <span style={{ fontSize: 12, color: s.muted }}>No non-manager team members.</span>
              )}
              {team.filter(m => m.role !== 'Manager').map(m => (
                <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: s.text }}>
                  <input type="checkbox" checked={accessIds.includes(m.id)} onChange={() => toggleAccess(m.id)} />
                  {m.name || '(unnamed)'} <span style={{ fontSize: 11, color: s.muted }}>{m.signage_approver ? 'approver' : m.role}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => void save()} style={s.btnPrimary}>{editId ? 'Save changes' : 'Create location'}</button>
            <button type="button" onClick={resetForm} style={s.btn}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: s.muted, padding: 16 }}>Loading…</div>
      ) : (
        <table style={s.tbl}>
          <thead>
            <tr>
              <th style={s.th}>Name</th>
              <th style={s.th}>Colors</th>
              <th style={s.th}>Theme</th>
              <th style={s.th}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  AbleSign
                  <button type="button" onClick={() => { asCheckedRef.current = true; void checkAbleSign(sites) }} title="Recheck connections" style={{ ...s.btnSmall, padding: '1px 6px' }}>↻</button>
                </span>
              </th>
              <th style={s.th}>Active</th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {sites.map(site => (
              <tr key={site.id}>
                <td style={s.td}>
                  <button type="button" onClick={() => startEdit(site)} style={{ background: 'none', border: 'none', color: s.text, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, padding: 0 }}>{site.name}</button>
                  <div style={{ fontSize: 11, color: s.muted }}>{site.slug}</div>
                </td>
                <td style={s.td}>
                  {site.use_brand_colors ? (
                    <span style={{ display: 'inline-flex', gap: 4 }}>
                      {[site.bg_color || '#162844', site.panel_color || '#1e3649', site.accent_color || '#96b7c8'].map((c, i) => (
                        <span key={i} style={{ width: 16, height: 16, borderRadius: 4, background: c, border: `1px solid ${s.border}` }} />
                      ))}
                    </span>
                  ) : <span style={{ fontSize: 12, color: s.muted }}>theme</span>}
                </td>
                <td style={s.tdMuted}>{site.use_brand_colors ? 'custom' : site.default_theme}</td>
                <td style={s.td}>
                  {(() => {
                    const st = asStatus[site.id]
                    const color = !st || st.state === 'loading' ? '#9aa0ab' : st.state === 'ok' ? '#22c55e' : '#ef4444'
                    const title = !st ? 'Not checked' : st.state === 'loading' ? 'Checking…' : st.state === 'ok' ? `Connected${st.screens != null ? ` — ${st.screens} screen(s)` : ''}` : (st.error || 'Not connected')
                    return (
                      <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: s.muted }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, flex: 'none' }} />
                        {st?.state === 'ok' && st.screens != null ? st.screens : st?.state === 'error' ? 'error' : ''}
                      </span>
                    )
                  })()}
                </td>
                <td style={s.tdMuted}>{site.active ? 'Yes' : 'No'}</td>
                <td style={s.td}>
                  <SignageDeleteButton confirmMessage={`Delete ${site.name}? Its screens and content stay in the database but become unassigned.`} onConfirm={async () => { const res = await fetch(`/api/signage/sites?id=${site.id}`, { method: 'DELETE' }); if (res.ok) { toast('Deleted', 'success'); await Promise.all([load(), refreshSites()]) } else { toast('Delete failed', 'error') } }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SignagePageShell>
  )
}
