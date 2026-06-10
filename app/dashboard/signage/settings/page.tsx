'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { SignagePageShell, useSignageTheme } from '../components/SignageAdmin'

export default function SignageSettingsPage() {
  const { theme } = useTheme()
  const { text, border, cardBg, inputBg } = useSignageTheme(theme)
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState({ center_name: '', weather_lat: 40.5649, weather_lon: -111.8389, ticker_extra: '' })
  const [team, setTeam] = useState<Array<{ id: string; name: string; role: string; signage_approver: boolean }>>([])
  const inputStyle: React.CSSProperties = { background: inputBg, border: `0.5px solid ${border}`, borderRadius: 10, padding: '8px 12px', fontSize: 14, color: text, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }

  const load = useCallback(async () => {
    const [s, t] = await Promise.all([
      supabase.from('signage_settings').select('center_name, weather_lat, weather_lon, ticker_extra').eq('id', 1).maybeSingle(),
      supabase.from('team').select('id, name, role, signage_approver').eq('active', true).order('name'),
    ])
    if (s.data) setSettings({
      center_name: s.data.center_name || '',
      weather_lat: Number(s.data.weather_lat),
      weather_lon: Number(s.data.weather_lon),
      ticker_extra: s.data.ticker_extra || '',
    })
    setTeam(t.data || [])
    setLoading(false)
  }, [supabase])

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
    <SignagePageShell title="Settings">
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
            <button type="button" onClick={() => void saveSettings()} style={{ padding: '10px 18px', background: '#1e6cb5', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', width: 'fit-content' }}>Save settings</button>
          </div>
        )}
      </div>
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
