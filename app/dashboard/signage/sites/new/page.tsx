'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { SignagePageShell, useSignageAdminStyles } from '../../components/SignageAdmin'
import { useSignage } from '../../components/SignageProvider'
import { SIGNAGE_THEMES } from '@/lib/signage/constants'
import {
  SITE_TEMPLATES,
  getSiteTemplate,
  guessTemplateKey,
  siteAreaSlug,
} from '@/lib/signage/site-templates'

type School = {
  code: string
  name: string
  city: string | null
  primary_color: string | null
  secondary_color: string | null
  accent_color: string | null
  text_color: string | null
}
type TeamMember = { id: string; name: string | null; role: string; signage_approver: boolean }

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export default function NewSchoolWizardPage() {
  const router = useRouter()
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const supabase = useMemo(() => createClient(), [])
  const { refreshSites, setActiveSite } = useSignage()

  const [schools, setSchools] = useState<School[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // form state
  const [schoolCode, setSchoolCode] = useState('')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [centerName, setCenterName] = useState('Canyons School District')
  const [templateKey, setTemplateKey] = useState('high')
  const [useBrand, setUseBrand] = useState(true)
  const [bg, setBg] = useState<string | null>(null)
  const [panel, setPanel] = useState<string | null>(null)
  const [accent, setAccent] = useState<string | null>(null)
  const [textColor, setTextColor] = useState<string | null>(null)
  const [defaultTheme, setDefaultTheme] = useState('primary')
  const [weatherLat, setWeatherLat] = useState(40.5649)
  const [weatherLon, setWeatherLon] = useState(-111.8389)
  const [weatherLabel, setWeatherLabel] = useState('')
  const [geoQuery, setGeoQuery] = useState('')
  const [geocoding, setGeocoding] = useState(false)
  const [asWorkspace, setAsWorkspace] = useState('')
  const [asKey, setAsKey] = useState('')
  const [grantIds, setGrantIds] = useState<string[]>([])

  const load = useCallback(async () => {
    const [schoolRes, teamRes] = await Promise.all([
      supabase.from('schools').select('code, name, city, primary_color, secondary_color, accent_color, text_color').eq('active', true).order('name'),
      supabase.from('team').select('id, name, role, signage_approver').eq('active', true).order('name'),
    ])
    setSchools((schoolRes.data as School[]) || [])
    setTeam((teamRes.data as TeamMember[]) || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { void load() }, [load])

  // Geocode a place to lat/lon for weather. Returns true on success.
  const runGeocode = useCallback(async (query: string): Promise<boolean> => {
    const q = query.trim()
    if (!q) return false
    setGeocoding(true)
    try {
      const res = await fetch(`/api/signage/geocode?q=${encodeURIComponent(q)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(data.error || 'Location lookup failed', 'error'); return false }
      setWeatherLat(data.lat)
      setWeatherLon(data.lon)
      setWeatherLabel(data.label || q)
      return true
    } finally {
      setGeocoding(false)
    }
  }, [])

  // When a school is picked, auto-fill name, slug, center name, colors, guess a
  // template, and look up the school city's weather coordinates.
  const pickSchool = (code: string) => {
    setSchoolCode(code)
    const school = schools.find(sc => sc.code === code)
    if (!school) return
    setName(school.name)
    setSlug(slugify(school.name))
    setCenterName(school.name)
    setTemplateKey(guessTemplateKey(school.name))
    setUseBrand(true)
    setBg(school.primary_color || null)
    setPanel(school.secondary_color || null)
    setAccent(school.accent_color || null)
    setTextColor(school.text_color || null)
    const place = school.city ? `${school.city}, Utah` : school.name
    setGeoQuery(school.city || '')
    void runGeocode(place)
  }

  const previewAreas = getSiteTemplate(templateKey).areas
  const effectiveSlug = slug.trim() || slugify(name)

  const toggleGrant = (id: string) => {
    setGrantIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  }

  const submit = async () => {
    if (!name.trim()) { toast('Pick a school or enter a name', 'error'); return }
    setSaving(true)
    const res = await fetch('/api/signage/sites/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_code: schoolCode || null,
        name: name.trim(),
        slug: effectiveSlug,
        center_name: centerName.trim() || 'Canyons School District',
        template_key: templateKey,
        use_brand_colors: useBrand,
        bg_color: bg,
        panel_color: panel,
        accent_color: accent,
        text_color: textColor,
        default_theme: defaultTheme,
        weather_lat: weatherLat,
        weather_lon: weatherLon,
        ablesign_workspace_id: asWorkspace.trim() || null,
        ablesign_api_key: asKey.trim() || null,
        grant_team_ids: grantIds,
      }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { toast(data.error || 'Provisioning failed', 'error'); return }
    toast(`Created ${data.site?.name} with ${data.areasCreated} area${data.areasCreated === 1 ? '' : 's'}`, 'success')
    await refreshSites()
    if (data.site?.id) setActiveSite(data.site.id)
    router.push('/dashboard/signage/sites')
  }

  const colorRow = (label: string, value: string | null, set: (v: string | null) => void, fallback: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 13, color: s.text, width: 90 }}>{label}</span>
      <input type="color" value={value || fallback} onChange={e => set(e.target.value)} style={{ width: 40, height: 30, border: 'none', background: 'none', cursor: 'pointer' }} />
      <input value={value || ''} placeholder={fallback} onChange={e => set(e.target.value || null)} style={{ ...s.input, width: 120, fontFamily: 'ui-monospace, monospace' }} />
      {value && <button type="button" onClick={() => set(null)} style={s.btnSmall}>Clear</button>}
    </div>
  )

  const sectionStyle: React.CSSProperties = { ...s.card, marginBottom: 16, display: 'grid', gap: 12 }

  if (loading) {
    return (
      <SignagePageShell title="Add a school" subtitle="Stand up a new signage location">
        <div style={{ color: s.muted, padding: 16 }}>Loading…</div>
      </SignagePageShell>
    )
  }

  return (
    <SignagePageShell title="Add a school" subtitle="Stand up a new signage location in one step">
      <div style={{ maxWidth: 620 }}>
        {/* 1. School */}
        <div style={sectionStyle}>
          <h3 style={s.h3}>1. School</h3>
          <div>
            <p style={s.lbl}>Pick a school (auto-fills name, colors, and a starting layout)</p>
            <select value={schoolCode} onChange={e => pickSchool(e.target.value)} style={{ ...s.input, minWidth: 260 }}>
              <option value="">— choose a school —</option>
              {schools.map(sc => <option key={sc.code} value={sc.code}>{sc.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <p style={s.lbl}>Site name</p>
              <input value={name} onChange={e => setName(e.target.value)} style={s.input} />
            </div>
            <div>
              <p style={s.lbl}>Slug (URL id)</p>
              <input value={slug} onChange={e => setSlug(e.target.value)} placeholder={slugify(name) || 'auto'} style={s.input} />
              {effectiveSlug && (
                <p style={{ fontSize: 11.5, color: s.muted, margin: '5px 0 0' }}>
                  Submission form: <code style={{ color: s.info }}>/signage/{effectiveSlug}/submit</code>
                </p>
              )}
            </div>
          </div>
          <div>
            <p style={s.lbl}>Center name (shown on screens)</p>
            <input value={centerName} onChange={e => setCenterName(e.target.value)} style={s.input} />
          </div>
        </div>

        {/* 2. Starting layout */}
        <div style={sectionStyle}>
          <h3 style={s.h3}>2. Starting layout</h3>
          <div>
            <p style={s.lbl}>Seed these areas (you can edit them afterward)</p>
            <select value={templateKey} onChange={e => setTemplateKey(e.target.value)} style={{ ...s.input, minWidth: 260 }}>
              {SITE_TEMPLATES.map(t => <option key={t.key} value={t.key}>{t.label} — {t.description}</option>)}
            </select>
          </div>
          {previewAreas.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {previewAreas.map(a => (
                <span key={a.slug} style={{ fontSize: 12, color: s.text, border: `1px solid ${s.border}`, borderRadius: 999, padding: '3px 10px' }}>
                  {a.name}
                </span>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: s.muted, margin: 0 }}>No areas will be created.</p>
          )}
          {previewAreas.length > 0 && effectiveSlug && (
            <p style={{ fontSize: 11, color: s.muted, margin: 0 }}>
              Area ids will be prefixed, e.g. <code>{siteAreaSlug(effectiveSlug, previewAreas[0].slug)}</code>.
            </p>
          )}
        </div>

        {/* 3. Branding */}
        <div style={sectionStyle}>
          <h3 style={s.h3}>3. Branding</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: s.text }}>
            <input type="checkbox" checked={useBrand} onChange={e => setUseBrand(e.target.checked)} />
            Use the school&apos;s brand colors (otherwise use a built-in theme)
          </label>
          {useBrand ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {colorRow('Background', bg, setBg, '#162844')}
              {colorRow('Panels', panel, setPanel, '#1e3649')}
              {colorRow('Accent', accent, setAccent, '#96b7c8')}
              {colorRow('Text', textColor, setTextColor, '#fefefe')}
              <p style={{ fontSize: 12, color: s.muted, margin: 0 }}>Panels and Text left blank are derived automatically.</p>
            </div>
          ) : (
            <div>
              <p style={s.lbl}>Theme</p>
              <select value={defaultTheme} onChange={e => setDefaultTheme(e.target.value)} style={s.input}>
                {SIGNAGE_THEMES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <p style={s.lbl}>Weather location (city or address)</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={geoQuery}
                onChange={e => setGeoQuery(e.target.value)}
                placeholder="e.g. Sandy"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void runGeocode(geoQuery) } }}
                style={{ ...s.input, width: 'auto', minWidth: 200 }}
              />
              <button type="button" onClick={() => void runGeocode(geoQuery)} disabled={geocoding} style={s.btn}>
                {geocoding ? 'Looking up…' : 'Look up'}
              </button>
              {weatherLabel && <span style={{ fontSize: 12, color: s.muted }}>📍 {weatherLabel}</span>}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <p style={s.lbl}>Weather latitude</p>
              <input type="number" step="0.0001" value={weatherLat} onChange={e => setWeatherLat(parseFloat(e.target.value) || 0)} style={s.input} />
            </div>
            <div>
              <p style={s.lbl}>Weather longitude</p>
              <input type="number" step="0.0001" value={weatherLon} onChange={e => setWeatherLon(parseFloat(e.target.value) || 0)} style={s.input} />
            </div>
          </div>
        </div>

        {/* 4. AbleSign (optional) */}
        <div style={sectionStyle}>
          <h3 style={s.h3}>4. AbleSign workspace <span style={{ fontSize: 12, fontWeight: 400, color: s.muted }}>(optional)</span></h3>
          <p style={{ fontSize: 12, color: s.muted, margin: 0 }}>Leave blank to use the shared/default workspace. Add a per-site workspace to keep this school&apos;s screens separate.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <p style={s.lbl}>Workspace ID</p>
              <input value={asWorkspace} onChange={e => setAsWorkspace(e.target.value)} style={s.input} />
            </div>
            <div>
              <p style={s.lbl}>API key</p>
              <input value={asKey} onChange={e => setAsKey(e.target.value)} placeholder="(uses server default if blank)" style={s.input} />
            </div>
          </div>
        </div>

        {/* 5. Access (optional) */}
        <div style={sectionStyle}>
          <h3 style={s.h3}>5. Who manages this site <span style={{ fontSize: 12, fontWeight: 400, color: s.muted }}>(optional)</span></h3>
          <p style={{ fontSize: 12, color: s.muted, margin: 0 }}>Grant site access to specific people. Managers can always see every site.</p>
          <div style={{ display: 'grid', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
            {team.map(m => (
              <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: s.text }}>
                <input type="checkbox" checked={grantIds.includes(m.id)} onChange={() => toggleGrant(m.id)} />
                {m.name || '(unnamed)'} <span style={{ fontSize: 11, color: s.muted }}>{m.role}{m.signage_approver ? ' · approver' : ''}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => void submit()} disabled={saving} style={{ ...s.btnPrimary, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Creating…' : 'Create school site'}
          </button>
          <button type="button" onClick={() => router.push('/dashboard/signage/sites')} style={s.btn}>Cancel</button>
        </div>
      </div>
    </SignagePageShell>
  )
}
