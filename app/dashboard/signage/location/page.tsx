'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { SignagePageShell, useSignageAdminStyles } from '../components/SignageAdmin'
import { useSignage } from '../components/SignageProvider'

type LocationForm = {
  center_name: string
  weather_lat: number
  weather_lon: number
}

// Canyons School District office — the default if a site has no coordinates yet.
const DEFAULTS: LocationForm = { center_name: 'Canyons School District', weather_lat: 40.5649, weather_lon: -111.8389 }

function mapSrc(lat: number, lon: number): string {
  const west = (lon - 0.03).toFixed(4)
  const east = (lon + 0.03).toFixed(4)
  const south = (lat - 0.02).toFixed(4)
  const north = (lat + 0.02).toFixed(4)
  return `https://www.openstreetmap.org/export/embed.html?bbox=${west}%2C${south}%2C${east}%2C${north}&layer=mapnik&marker=${lat}%2C${lon}`
}

export default function SignageLocationPage() {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const supabase = useMemo(() => createClient(), [])
  const { activeSiteId, sites } = useSignage()

  const [form, setForm] = useState<LocationForm>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchMsg, setSearchMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!activeSiteId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('signage_sites')
      .select('center_name, weather_lat, weather_lon')
      .eq('id', activeSiteId)
      .maybeSingle()
    if (data) {
      setForm({
        center_name: data.center_name ?? DEFAULTS.center_name,
        weather_lat: typeof data.weather_lat === 'number' ? data.weather_lat : DEFAULTS.weather_lat,
        weather_lon: typeof data.weather_lon === 'number' ? data.weather_lon : DEFAULTS.weather_lon,
      })
    } else {
      setForm(DEFAULTS)
    }
    setSearchMsg(null)
    setLoading(false)
  }, [supabase, activeSiteId])

  useEffect(() => { void load() }, [load])

  const activeSiteName = sites.find(si => si.id === activeSiteId)?.name || 'this location'

  const doSearch = async () => {
    const q = query.trim()
    if (!q) { toast('Type a city, address, or place', 'error'); return }
    setSearching(true)
    setSearchMsg(null)
    try {
      const res = await fetch(`/api/signage/geocode?q=${encodeURIComponent(q)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSearchMsg(typeof data.error === 'string' ? data.error : 'No match found')
        return
      }
      setForm(f => ({
        ...f,
        weather_lat: data.lat,
        weather_lon: data.lon,
        center_name: f.center_name.trim() ? f.center_name : (data.label || f.center_name),
      }))
      setSearchMsg(`Found ${data.label} — ${data.lat}, ${data.lon}`)
    } catch {
      setSearchMsg('Search failed — try again')
    } finally {
      setSearching(false)
    }
  }

  const save = async () => {
    if (!activeSiteId) { toast('Pick a location first', 'error'); return }
    setSaving(true)
    const res = await fetch('/api/signage/sites/template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site_id: activeSiteId,
        center_name: form.center_name,
        weather_lat: form.weather_lat,
        weather_lon: form.weather_lon,
      }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { toast(data.error || 'Save failed', 'error'); return }
    toast('Location saved', 'success')
  }

  if (!activeSiteId) {
    return (
      <SignagePageShell title="Location & weather" subtitle="Where this location is, for weather and the clock">
        <div style={{ ...s.card, color: s.muted }}>Pick a location from the switcher to set its coordinates.</div>
      </SignagePageShell>
    )
  }

  if (loading) {
    return (
      <SignagePageShell title="Location & weather" subtitle="Where this location is, for weather and the clock">
        <div style={{ color: s.muted, padding: 16 }}>Loading…</div>
      </SignagePageShell>
    )
  }

  return (
    <SignagePageShell title="Location & weather" subtitle={`Coordinates for ${activeSiteName}`}>
      <div style={{ maxWidth: 560, display: 'grid', gap: 16 }}>
        <div style={{ ...s.card, display: 'grid', gap: 12 }}>
          <h3 style={s.h3}>Find this location</h3>
          <p style={{ fontSize: 12, color: s.muted, margin: 0 }}>
            Search a city, address, or place and we&rsquo;ll fill in the coordinates — no need to look up latitude and longitude yourself.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void doSearch() } }}
              placeholder="e.g. Sandy, Utah or 9361 S 300 E"
              style={{ ...s.input, flex: 1 }}
            />
            <button type="button" onClick={() => void doSearch()} disabled={searching} style={{ ...s.btnPrimary, opacity: searching ? 0.6 : 1 }}>
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
          {searchMsg && <p style={{ fontSize: 12.5, color: s.muted, margin: 0 }}>{searchMsg}</p>}
        </div>

        <div style={{ ...s.card, display: 'grid', gap: 12 }}>
          <h3 style={s.h3}>Coordinates</h3>
          <div>
            <p style={s.lbl}>Location label (shown on screens)</p>
            <input
              value={form.center_name}
              onChange={e => setForm(f => ({ ...f, center_name: e.target.value }))}
              placeholder="e.g. Sandy, Utah"
              style={s.input}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <p style={s.lbl}>Latitude</p>
              <input type="number" step="0.0001" value={form.weather_lat} onChange={e => setForm(f => ({ ...f, weather_lat: parseFloat(e.target.value) || 0 }))} style={s.input} />
            </div>
            <div>
              <p style={s.lbl}>Longitude</p>
              <input type="number" step="0.0001" value={form.weather_lon} onChange={e => setForm(f => ({ ...f, weather_lon: parseFloat(e.target.value) || 0 }))} style={s.input} />
            </div>
          </div>
          <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${s.border}` }}>
            <iframe
              title="Location map"
              src={mapSrc(form.weather_lat, form.weather_lon)}
              style={{ width: '100%', height: 240, border: 0, display: 'block' }}
            />
          </div>
          <p style={{ fontSize: 11.5, color: s.muted, margin: 0 }}>The pin shows the saved point. Used for the weather widget and local time on this location&rsquo;s screens.</p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => void save()} disabled={saving} style={{ ...s.btnPrimary, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save location'}
          </button>
        </div>
      </div>
    </SignagePageShell>
  )
}
