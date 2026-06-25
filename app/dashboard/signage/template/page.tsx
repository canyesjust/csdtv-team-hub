'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { SignagePageShell, useSignageAdminStyles } from '../components/SignageAdmin'
import { useSignage } from '../components/SignageProvider'

type TemplateRow = {
  name: string
  default_layout: string
  show_weather: boolean
  show_clock: boolean
  show_ticker: boolean
  show_visitor_welcome: boolean
  show_calendar_ticker: boolean
  brand_title: string | null
  brand_subtitle: string | null
  logo_url: string | null
}

const LAYOUT_OPTIONS = [
  { value: 'zoned', label: 'Zoned', hint: 'Header, media, announcements rail, ticker.' },
  { value: 'full_bleed', label: 'Full bleed', hint: 'Edge-to-edge media with a ticker.' },
  { value: 'wayfinding', label: 'Wayfinding', hint: 'Directory + media + announcements.' },
]

const DEFAULTS: TemplateRow = {
  name: '', default_layout: 'zoned', show_weather: true, show_clock: true,
  show_ticker: true, show_visitor_welcome: true, show_calendar_ticker: false,
  brand_title: null, brand_subtitle: null, logo_url: null,
}

export default function SignageTemplatePage() {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const supabase = useMemo(() => createClient(), [])
  const { activeSiteId, sites } = useSignage()

  const [form, setForm] = useState<TemplateRow>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!activeSiteId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('signage_sites')
      .select('name, default_layout, show_weather, show_clock, show_ticker, show_visitor_welcome, show_calendar_ticker, brand_title, brand_subtitle, logo_url')
      .eq('id', activeSiteId)
      .maybeSingle()
    if (data) {
      setForm({
        name: data.name ?? '',
        default_layout: data.default_layout ?? 'zoned',
        show_weather: data.show_weather ?? true,
        show_clock: data.show_clock ?? true,
        show_ticker: data.show_ticker ?? true,
        show_visitor_welcome: data.show_visitor_welcome ?? true,
        show_calendar_ticker: data.show_calendar_ticker ?? false,
        brand_title: data.brand_title ?? null,
        brand_subtitle: data.brand_subtitle ?? null,
        logo_url: data.logo_url ?? null,
      })
    } else {
      setForm(DEFAULTS)
    }
    setLoading(false)
  }, [supabase, activeSiteId])

  useEffect(() => { void load() }, [load])

  const activeSiteName = sites.find(si => si.id === activeSiteId)?.name || form.name

  const save = async () => {
    if (!activeSiteId) { toast('Pick a site first', 'error'); return }
    setSaving(true)
    const res = await fetch('/api/signage/sites/template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id: activeSiteId, ...form }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { toast(data.error || 'Save failed', 'error'); return }
    toast('Template saved', 'success')
  }

  const toggle = (key: 'show_weather' | 'show_clock' | 'show_ticker' | 'show_visitor_welcome' | 'show_calendar_ticker') => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: s.text }}>
      <input type="checkbox" checked={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} />
      {{
        show_weather: 'Weather',
        show_clock: 'Clock',
        show_ticker: 'Ticker bar',
        show_visitor_welcome: 'Visitor welcome',
        show_calendar_ticker: 'District calendar in ticker',
      }[key]}
    </label>
  )

  if (!activeSiteId) {
    return (
      <SignagePageShell title="Template" subtitle="The default look for this site's screens">
        <div style={{ ...s.card, color: s.muted }}>Pick a site from the switcher to edit its template.</div>
      </SignagePageShell>
    )
  }

  if (loading) {
    return (
      <SignagePageShell title="Template" subtitle="The default look for this site's screens">
        <div style={{ color: s.muted, padding: 16 }}>Loading…</div>
      </SignagePageShell>
    )
  }

  return (
    <SignagePageShell title="Template" subtitle={`Default look for ${activeSiteName}'s screens`}>
      <div style={{ maxWidth: 560, display: 'grid', gap: 16 }}>
        <div style={{ ...s.card, display: 'grid', gap: 12 }}>
          <h3 style={s.h3}>Default layout</h3>
          <p style={{ fontSize: 12, color: s.muted, margin: 0 }}>
            Every screen at this site uses this layout unless its own layout is set to something other than &ldquo;Inherit&rdquo;.
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            {LAYOUT_OPTIONS.map(opt => (
              <label key={opt.value} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: s.text, cursor: 'pointer' }}>
                <input type="radio" name="layout" checked={form.default_layout === opt.value} onChange={() => setForm(f => ({ ...f, default_layout: opt.value }))} style={{ marginTop: 3 }} />
                <span>
                  <span style={{ fontWeight: 500 }}>{opt.label}</span>
                  <span style={{ display: 'block', fontSize: 12, color: s.muted }}>{opt.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ ...s.card, display: 'grid', gap: 10 }}>
          <h3 style={s.h3}>Widgets</h3>
          <p style={{ fontSize: 12, color: s.muted, margin: 0 }}>Turn header and footer widgets on or off for this site.</p>
          {toggle('show_weather')}
          {toggle('show_clock')}
          {toggle('show_ticker')}
          {toggle('show_visitor_welcome')}
          {toggle('show_calendar_ticker')}
        </div>

        <div style={{ ...s.card, display: 'grid', gap: 12 }}>
          <h3 style={s.h3}>Branding</h3>
          <div>
            <p style={s.lbl}>Header title</p>
            <input value={form.brand_title || ''} placeholder={activeSiteName} onChange={e => setForm(f => ({ ...f, brand_title: e.target.value || null }))} style={s.input} />
          </div>
          <div>
            <p style={s.lbl}>Header subtitle</p>
            <input value={form.brand_subtitle || ''} placeholder="(e.g. school tagline)" onChange={e => setForm(f => ({ ...f, brand_subtitle: e.target.value || null }))} style={s.input} />
          </div>
          <div>
            <p style={s.lbl}>Logo URL</p>
            <input value={form.logo_url || ''} placeholder="https://… (blank uses the default CIC logo)" onChange={e => setForm(f => ({ ...f, logo_url: e.target.value || null }))} style={{ ...s.input, fontFamily: 'ui-monospace, monospace' }} />
            {form.logo_url && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.logo_url} alt="" style={{ height: 36, maxWidth: 160, objectFit: 'contain', background: '#0b1b2b', borderRadius: 6, padding: 4 }} onError={e => { e.currentTarget.style.display = 'none' }} />
                <span style={{ fontSize: 11, color: s.muted }}>Preview</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => void save()} disabled={saving} style={{ ...s.btnPrimary, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save template'}
          </button>
        </div>
      </div>
    </SignagePageShell>
  )
}
