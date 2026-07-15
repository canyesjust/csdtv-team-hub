'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { AbleSignTestConnection } from '../components/AbleSignControls'
import { SignagePageShell, useSignageTheme } from '../components/SignageAdmin'
import { useSignage } from '../components/SignageProvider'
import { SIGNAGE_THEMES } from '@/lib/signage/constants'

export default function SignageSettingsPage() {
  const { theme } = useTheme()
  const { activeSiteId } = useSignage()
  const { text, border, cardBg, inputBg } = useSignageTheme(theme)
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState({ center_name: '', weather_lat: 40.5649, weather_lon: -111.8389, ticker_extra: '', default_theme: 'primary' })
  const [team, setTeam] = useState<Array<{ id: string; name: string; role: string; signage_approver: boolean }>>([])
  const [boardLink, setBoardLink] = useState<string | null>(null)
  const [rotating, setRotating] = useState(false)
  const inputStyle: React.CSSProperties = { background: inputBg, border: `0.5px solid ${border}`, borderRadius: 10, padding: '8px 12px', fontSize: 14, color: text, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }

  const load = useCallback(async () => {
    const [s, t] = await Promise.all([
      supabase.from('signage_settings').select('center_name, weather_lat, weather_lon, ticker_extra, default_theme').eq('id', 1).maybeSingle(),
      supabase.from('team').select('id, name, role, signage_approver').eq('active', true).order('name'),
    ])
    if (s.data) setSettings({
      center_name: s.data.center_name || '',
      weather_lat: Number(s.data.weather_lat),
      weather_lon: Number(s.data.weather_lon),
      ticker_extra: s.data.ticker_extra || '',
      default_theme: s.data.default_theme || 'primary',
    })
    setTeam(t.data || [])
    try {
      const bl = await fetch('/api/signage/board-link')
      if (bl.ok) { const d = await bl.json(); setBoardLink(d.url ?? null) }
    } catch {}
    setLoading(false)
  }, [supabase])

  const copyBoardLink = () => {
    if (!boardLink) return
    void navigator.clipboard.writeText(boardLink)
    toast('Board link copied', 'success')
  }

  const rotateBoardLink = async () => {
    if (!window.confirm('Rotate the board token? The current link stops working and every TV showing the board must be updated to the new link.')) return
    setRotating(true)
    try {
      const res = await fetch('/api/signage/board-link', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast(d.error || 'Rotate failed', 'error'); return }
      setBoardLink(d.url ?? null)
      toast('New board link generated — update the TVs', 'success')
    } finally {
      setRotating(false)
    }
  }

  useEffect(() => { void load() }, [load])

  const saveSettings = async () => {
    const res = await fetch('/api/signage/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) })
    if (!res.ok) { toast('Save failed', 'error'); return }
    toast('Settings saved', 'success')
  }

  const toggleApprover = async (teamId: string, value: boolean) => {
    const res = await fetch('/api/signage/approvers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team_id: teamId, signage_approver: value }) })
    if (!res.ok) { toast('Update failed', 'error'); return }
    setTeam(prev => prev.map(m => m.id === teamId ? { ...m, signage_approver: value } : m))
  }

  return (
    <SignagePageShell title="Signage settings" subtitle="Center name, weather, ticker & defaults">
      <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 20, marginBottom: 24, maxWidth: 520 }}>
        <h3 style={{ margin: '0 0 12px' }}>Center</h3>
        {loading ? (
          <div style={{ color: '#6b7280', padding: 8 }}>Loading settings…</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <input placeholder="Center name" value={settings.center_name} onChange={e => setSettings(s => ({ ...s, center_name: e.target.value }))} style={inputStyle} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input type="number" step="0.0001" value={settings.weather_lat} onChange={e => setSettings(s => ({ ...s, weather_lat: parseFloat(e.target.value) }))} style={inputStyle} placeholder="Lat" />
              <input type="number" step="0.0001" value={settings.weather_lon} onChange={e => setSettings(s => ({ ...s, weather_lon: parseFloat(e.target.value) }))} style={inputStyle} placeholder="Lon" />
            </div>
            <textarea placeholder="Extra ticker text" value={settings.ticker_extra} onChange={e => setSettings(s => ({ ...s, ticker_extra: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' as const }} />
            <label style={{ fontSize: 13, color: text, display: 'grid', gap: 4 }}>
              Default screen theme
              <select value={settings.default_theme} onChange={e => setSettings(s => ({ ...s, default_theme: e.target.value }))} style={inputStyle}>
                {SIGNAGE_THEMES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => void saveSettings()} style={{ padding: '10px 18px', background: '#1e6cb5', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', width: 'fit-content' }}>Save settings</button>
          </div>
        )}
      </div>
      <AbleSignTestConnection siteId={activeSiteId} />

      {boardLink && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 20, marginBottom: 24, maxWidth: 520 }}>
          <h3 style={{ margin: '0 0 6px' }}>Broadcast board link</h3>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
            The public <code>/signage</code> board opens with this private link — put it on the office TV. Anyone with the link can view the board, so don&rsquo;t post it publicly. Rotate it to invalidate the old link (e.g. if it leaks); you&rsquo;ll then need to update every TV.
          </p>
          <input readOnly value={boardLink} onFocus={e => e.currentTarget.select()} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12.5, marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={copyBoardLink} style={{ padding: '8px 16px', background: '#1e6cb5', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>Copy link</button>
            <button type="button" onClick={() => void rotateBoardLink()} disabled={rotating} style={{ padding: '8px 16px', background: 'transparent', color: text, border: `1px solid ${border}`, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', opacity: rotating ? 0.6 : 1 }}>{rotating ? 'Rotating…' : 'Rotate token'}</button>
          </div>
        </div>
      )}

      {!loading && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 20 }}>
          <h3 style={{ margin: '0 0 12px' }}>Signage approvers</h3>
          {team.map(m => (
            <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', fontSize: 14, color: text, borderBottom: `1px solid ${border}` }}>
              <input type="checkbox" checked={m.signage_approver} onChange={e => void toggleApprover(m.id, e.target.checked)} />
              <span>{m.name} <span style={{ opacity: 0.6 }}>({m.role})</span></span>
            </label>
          ))}
        </div>
      )}
    </SignagePageShell>
  )
}
