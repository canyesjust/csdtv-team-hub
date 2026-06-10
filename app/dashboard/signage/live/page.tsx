'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { toast } from '@/lib/toast'
import { isSignageStreamUrl, normalizeSignageStreamUrl } from '@/lib/signage/stream-url'
import SignageTargetingPicker, { SignagePageShell, useSignageTheme, type TargetingValue } from '../components/SignageAdmin'
import { useSignage } from '../components/SignageProvider'

export default function SignageLivePage() {
  const { theme } = useTheme()
  const { text, muted, border, cardBg, inputBg } = useSignageTheme(theme)
  const { areas, screens } = useSignage()
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ is_live: false, hls_url: '', label: '', all_screens: true })
  const [targeting, setTargeting] = useState<TargetingValue>({ all_screens: true, target_area_ids: [], target_screen_ids: [] })
  const [saving, setSaving] = useState(false)
  const inputStyle: React.CSSProperties = { background: inputBg, border: `0.5px solid ${border}`, borderRadius: 10, padding: '8px 12px', fontSize: 14, color: text, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }

  const load = useCallback(async () => {
    const liveRes = await fetch('/api/signage/live')
    const liveData = await liveRes.json().catch(() => ({}))
    const live = liveData.live
    if (live) {
      setForm({ is_live: live.is_live, hls_url: live.hls_url || '', label: live.label || '', all_screens: live.all_screens })
      setTargeting({ all_screens: live.all_screens, target_area_ids: live.target_area_ids || [], target_screen_ids: live.target_screen_ids || [] })
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    const streamUrl = normalizeSignageStreamUrl(form.hls_url)
    if (form.is_live && (!streamUrl || !isSignageStreamUrl(streamUrl))) {
      toast('Enter an HLS (.m3u8) or YouTube live URL before going live.', 'error')
      return
    }
    const payload = {
      ...form,
      hls_url: streamUrl,
      ...targeting,
    }
    if (
      form.is_live &&
      !payload.all_screens &&
      payload.target_area_ids.length === 0 &&
      payload.target_screen_ids.length === 0
    ) {
      payload.all_screens = true
    }
    setSaving(true)
    const res = await fetch('/api/signage/live', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      toast(typeof data.error === 'string' ? data.error : 'Save failed', 'error')
      return
    }
    toast(form.is_live ? 'Live takeover is on — screens update within ~5 seconds' : 'Live cleared', 'success')
    void load()
  }

  const endLive = async () => {
    setForm(f => ({ ...f, is_live: false }))
    setSaving(true)
    const res = await fetch('/api/signage/live', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_live: false, hls_url: form.hls_url, label: form.label, ...targeting }),
    })
    setSaving(false)
    if (!res.ok) { toast('Could not end live', 'error'); return }
    toast('Live takeover ended', 'success')
    void load()
  }

  return (
    <SignagePageShell title="Live stream">
      <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 20, maxWidth: 560 }}>
        {loading ? (
          <div style={{ color: muted, padding: 8 }}>Loading live state…</div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: muted, margin: '0 0 14px', lineHeight: 1.55 }}>
              Paste an encoder HLS URL (<code>.m3u8</code>) or a YouTube live/watch link. Targeted screens with
              &ldquo;Accepts live takeover&rdquo; enabled will switch within about 5 seconds.
            </p>
            <label style={{ display: 'flex', gap: 8, marginBottom: 12, fontSize: 15, color: text }}>
              <input type="checkbox" checked={form.is_live} onChange={e => setForm(f => ({ ...f, is_live: e.target.checked }))} />
              Live on air
            </label>
            <input
              placeholder="HLS (.m3u8) or YouTube live URL"
              value={form.hls_url}
              onChange={e => setForm(f => ({ ...f, hls_url: e.target.value }))}
              style={{ ...inputStyle, marginBottom: 10 }}
            />
            <input placeholder="On-screen title (e.g. Demo Day livestream)" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} style={{ ...inputStyle, marginBottom: 12 }} />
            <SignageTargetingPicker areas={areas} screens={screens} value={targeting} onChange={v => { setTargeting(v); setForm(f => ({ ...f, all_screens: v.all_screens })) }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                style={{ padding: '10px 18px', background: form.is_live ? '#ef4444' : '#1e6cb5', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {form.is_live ? 'Apply live takeover' : 'Save stream URL'}
              </button>
              {form.is_live && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void endLive()}
                  style={{ padding: '10px 18px', background: 'transparent', color: text, border: `1px solid ${border}`, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  End live
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </SignagePageShell>
  )
}
