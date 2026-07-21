'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { SignagePageShell, useSignageAdminStyles } from '../components/SignageAdmin'
import { useSignage } from '../components/SignageProvider'
import {
  RAIL_WIDGETS,
  BAND_WIDGETS,
  RAIL_WIDGET_LABELS,
  BAND_WIDGET_LABELS,
  DEFAULT_ZONE_CONFIG,
  resolveZoneConfig,
  isDefaultZoneConfig,
  type RailWidget,
  type BandWidget,
  type ZoneConfig,
} from '@/lib/signage/zones'

type ScreenRow = { id: string; code: string; name: string; layout: string; zone_config: unknown }

export default function SignageLayoutBuilderPage() {
  const { theme } = useTheme()
  const s = useSignageAdminStyles(theme)
  const supabase = useMemo(() => createClient(), [])
  const { activeSiteId } = useSignage()

  const [screens, setScreens] = useState<ScreenRow[]>([])
  const [screenId, setScreenId] = useState('')
  const [cfg, setCfg] = useState<ZoneConfig>(DEFAULT_ZONE_CONFIG)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [previewNonce, setPreviewNonce] = useState(0)

  const load = useCallback(async () => {
    if (!activeSiteId) { setScreens([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('signage_screens')
      .select('id, code, name, layout, zone_config')
      .eq('site_id', activeSiteId)
      .order('name')
    setScreens((data as ScreenRow[]) ?? [])
    setLoading(false)
  }, [supabase, activeSiteId])

  useEffect(() => { void load() }, [load])

  const selected = screens.find(sc => sc.id === screenId)

  const pick = (id: string) => {
    setScreenId(id)
    const sc = screens.find(x => x.id === id)
    setCfg(resolveZoneConfig(sc?.zone_config))
  }

  const save = async (config: ZoneConfig) => {
    if (!screenId) { toast('Pick a screen first', 'error'); return }
    setSaving(true)
    const res = await fetch('/api/signage/screens/zone-config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: screenId, zone_config: config }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { toast(data.error || 'Save failed', 'error'); return }
    toast('Layout saved — the screen updates within a few minutes', 'success')
    await load()
    setPreviewNonce(n => n + 1)
  }

  const railSelect = (slot: 'railTop' | 'railMid' | 'railBottom', label: string) => (
    <div>
      <p style={s.lbl}>{label}</p>
      <select value={cfg[slot]} onChange={e => setCfg(c => ({ ...c, [slot]: e.target.value as RailWidget }))} style={s.input}>
        {RAIL_WIDGETS.map(w => <option key={w} value={w}>{RAIL_WIDGET_LABELS[w]}</option>)}
      </select>
    </div>
  )

  if (!activeSiteId) {
    return (
      <SignagePageShell title="Layout builder" subtitle="Choose what fills each zone on a screen">
        <div style={{ ...s.card, color: s.muted }}>Pick a location from the switcher to edit its screens.</div>
      </SignagePageShell>
    )
  }

  const isZoned2 = selected?.layout === 'zoned2'
  const dirty = selected ? JSON.stringify(cfg) !== JSON.stringify(resolveZoneConfig(selected.zone_config)) : false

  return (
    <SignagePageShell title="Layout builder" subtitle="Choose what fills each zone on a screen (Zoned 2 layout)">
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(280px, 360px) 1fr', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ ...s.card, display: 'grid', gap: 12 }}>
            <div>
              <p style={s.lbl}>Screen</p>
              <select value={screenId} onChange={e => pick(e.target.value)} style={s.input} disabled={loading}>
                <option value="">{loading ? 'Loading…' : screens.length ? 'Select a screen…' : 'No screens at this location'}</option>
                {screens.map(sc => <option key={sc.id} value={sc.id}>{sc.name} ({sc.code})</option>)}
              </select>
            </div>

            {selected && !isZoned2 && (
              <p style={{ fontSize: 12, color: s.muted, margin: 0 }}>
                This screen uses the <strong style={{ color: s.text }}>{selected.layout}</strong> layout. Zone arrangements only apply to <strong style={{ color: s.text }}>Zoned 2</strong> screens, so saving here has no visible effect until the screen is set to Zoned 2 on the Screens page.
              </p>
            )}
          </div>

          {selected && (
            <div style={{ ...s.card, display: 'grid', gap: 12 }}>
              <h3 style={s.h3}>Right rail (top to bottom)</h3>
              <p style={{ fontSize: 11.5, color: s.muted, margin: 0 }}>The big media cell on the left is fixed. Choose what fills each of the three rail cells and the bottom band. Set a rail cell to &ldquo;None&rdquo; to leave it empty — the remaining rail cell(s) expand to fill the freed space.</p>
              {railSelect('railTop', 'Rail — top')}
              {railSelect('railMid', 'Rail — middle')}
              {railSelect('railBottom', 'Rail — bottom')}
              <div>
                <p style={s.lbl}>Bottom band</p>
                <select value={cfg.band} onChange={e => setCfg(c => ({ ...c, band: e.target.value as BandWidget }))} style={s.input}>
                  {BAND_WIDGETS.map(w => <option key={w} value={w}>{BAND_WIDGET_LABELS[w]}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => void save(cfg)} disabled={saving || !dirty} style={{ ...s.btnPrimary, opacity: saving || !dirty ? 0.6 : 1 }}>
                  {saving ? 'Saving…' : 'Save layout'}
                </button>
                <button type="button" onClick={() => { setCfg(DEFAULT_ZONE_CONFIG); void save(DEFAULT_ZONE_CONFIG) }} disabled={saving || (isDefaultZoneConfig(cfg) && selected.zone_config == null)} style={s.btnSmall}>
                  Reset to default
                </button>
              </div>
              <p style={{ fontSize: 11.5, color: s.muted, margin: 0 }}>Saving marks the screen for a fresh push; the offline HTML reloads with the new layout within a few minutes.</p>
            </div>
          )}
        </div>

        <div style={{ ...s.card, display: 'grid', gap: 10, minHeight: 320 }}>
          <h3 style={s.h3}>Preview</h3>
          {selected ? (
            <>
              <p style={{ fontSize: 11.5, color: s.muted, margin: 0 }}>Shows the last <strong style={{ color: s.text }}>saved</strong> layout for this screen. Save to refresh it.</p>
              <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 10, overflow: 'hidden', border: `1px solid ${s.border}`, background: '#000' }}>
                <iframe
                  key={previewNonce}
                  title="Screen preview"
                  src={`/api/signage/push/${encodeURIComponent(selected.code)}?_=${previewNonce}`}
                  style={{ position: 'absolute', top: 0, left: 0, width: '177.78%', height: '177.78%', transform: 'scale(0.5625)', transformOrigin: 'top left', border: 0 }}
                />
              </div>
            </>
          ) : (
            <div style={{ color: s.muted, fontSize: 13 }}>Pick a screen to preview it.</div>
          )}
        </div>
      </div>
    </SignagePageShell>
  )
}
