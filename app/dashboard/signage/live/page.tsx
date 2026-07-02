'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { toast } from '@/lib/toast'
import { confirmDialog } from '@/lib/confirm'
import { isSignageStreamUrl, normalizeSignageStreamUrl, youtubeEmbedUrlFromStreamUrl } from '@/lib/signage/stream-url'
import SignageTargetingPicker, { SignagePageShell, useSignageTheme, type TargetingValue } from '../components/SignageAdmin'
import { useSignage } from '../components/SignageProvider'

export default function SignageLivePage() {
  const { theme } = useTheme()
  const { text, muted, border, cardBg, inputBg } = useSignageTheme(theme)
  const { areas, screens, activeSiteId } = useSignage()
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ is_live: false, hls_url: '', label: '', all_screens: true })
  const [targeting, setTargeting] = useState<TargetingValue>({ all_screens: true, target_area_ids: [], target_screen_ids: [] })
  const [saving, setSaving] = useState(false)
  const inputStyle: React.CSSProperties = { background: inputBg, border: `0.5px solid ${border}`, borderRadius: 10, padding: '8px 12px', fontSize: 14, color: text, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }

  // Board meeting takeover (separate from the generic stream takeover above).
  const [bt, setBt] = useState<{ active: boolean; mode: string; board_channel_number: number | null; label: string | null } | null>(null)
  const [btChannel, setBtChannel] = useState('')
  const [btLabel, setBtLabel] = useState('')
  const [btSaving, setBtSaving] = useState(false)

  useEffect(() => {
    fetch('/api/signage/board-takeover').then(r => r.json()).then(d => {
      const t = d.takeover
      if (t) {
        setBt(t)
        if (t.board_channel_number) setBtChannel(String(t.board_channel_number))
        if (t.label) setBtLabel(t.label)
      }
    }).catch(() => {})
  }, [])

  // Keep a takeover started/managed from this page "fresh" while the page is open
  // (matches the control-surface heartbeat). If this page is closed and nothing
  // else is pinging, the takeover self-clears within minutes — a fail-safe so the
  // district screens can't get stuck on a forgotten takeover.
  useEffect(() => {
    if (!bt?.active) return
    let stop = false
    const ping = () => {
      if (stop) return
      fetch('/api/signage/board-takeover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'keepalive' }),
      }).catch(() => {})
    }
    ping()
    const id = setInterval(ping, 60_000)
    return () => { stop = true; clearInterval(id) }
  }, [bt?.active])

  const btPost = async (action: 'preroll' | 'live' | 'off') => {
    if (action === 'live') {
      const ok = await confirmDialog({ title: 'Go live on the signage screens?', message: 'Every screen with board takeover enabled will switch to the live board stream within about 5 seconds.', confirmLabel: 'Go live', tone: 'danger' })
      if (!ok) return
    }
    setBtSaving(true)
    const res = await fetch('/api/signage/board-takeover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, board_channel_number: Number(btChannel) || undefined, label: btLabel }),
    })
    const data = await res.json().catch(() => ({}))
    setBtSaving(false)
    if (!res.ok) { toast(typeof data.error === 'string' ? data.error : 'Failed', 'error'); return }
    const r = await fetch('/api/signage/board-takeover')
    const d = await r.json().catch(() => ({}))
    setBt(d.takeover || null)
    toast(action === 'off' ? 'Board takeover ended' : action === 'live' ? 'Screens switched to the live stream' : 'Board preroll is on the signage screens', 'success')
  }

  // Live preview of the entered YouTube stream — autoplays muted with captions on.
  const previewEmbed = useMemo(
    () => youtubeEmbedUrlFromStreamUrl(normalizeSignageStreamUrl(form.hls_url) || '', { controls: true }),
    [form.hls_url],
  )

  const load = useCallback(async () => {
    if (!activeSiteId) { setLoading(false); return }
    const liveRes = await fetch(`/api/signage/live?site_id=${activeSiteId}`)
    const liveData = await liveRes.json().catch(() => ({}))
    const live = liveData.live
    if (live) {
      setForm({ is_live: live.is_live, hls_url: live.hls_url || '', label: live.label || '', all_screens: live.all_screens })
      setTargeting({ all_screens: live.all_screens, target_area_ids: live.target_area_ids || [], target_screen_ids: live.target_screen_ids || [] })
    } else {
      setForm({ is_live: false, hls_url: '', label: '', all_screens: true })
      setTargeting({ all_screens: true, target_area_ids: [], target_screen_ids: [] })
    }
    setLoading(false)
  }, [activeSiteId])

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
      site_id: activeSiteId,
    }
    if (
      form.is_live &&
      !payload.all_screens &&
      payload.target_area_ids.length === 0 &&
      payload.target_screen_ids.length === 0
    ) {
      payload.all_screens = true
    }
    if (form.is_live) {
      const scope = payload.all_screens
        ? 'all screens at this location'
        : `${payload.target_area_ids.length + payload.target_screen_ids.length} selected target${payload.target_area_ids.length + payload.target_screen_ids.length === 1 ? '' : 's'}`
      const ok = await confirmDialog({ title: 'Take over the screens?', message: `${scope.charAt(0).toUpperCase() + scope.slice(1)} will switch to this live stream within about 5 seconds.`, confirmLabel: 'Take over', tone: 'danger' })
      if (!ok) return
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
      body: JSON.stringify({ is_live: false, hls_url: form.hls_url, label: form.label, ...targeting, site_id: activeSiteId }),
    })
    setSaving(false)
    if (!res.ok) { toast('Could not end live', 'error'); return }
    toast('Live takeover ended', 'success')
    void load()
  }

  return (
    <SignagePageShell title="Live takeover" subtitle="Take over the screens with a live stream">
      <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 20, maxWidth: 560 }}>
        {loading ? (
          <div style={{ color: muted, padding: 8 }}>Loading live state…</div>
        ) : (
          <>
            {previewEmbed && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: 12, overflow: 'hidden', background: '#000', border: `1px solid ${border}` }}>
                  <iframe
                    src={previewEmbed}
                    title="Live stream preview"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                  />
                </div>
                <p style={{ fontSize: 12, color: muted, margin: '6px 0 0' }}>Preview · autoplays muted with captions on, matching the screens.</p>
              </div>
            )}
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

      <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 20, marginTop: 20, maxWidth: 560 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: text, margin: '0 0 4px' }}>Board meeting takeover</h3>
        <p style={{ fontSize: 13, color: muted, margin: '0 0 14px', lineHeight: 1.55 }}>
          Takes over signage screens that have board takeover enabled. Start the preroll graphic, flip to the live
          YouTube stream (pulled from the meeting&apos;s production), then end to return screens to normal signage.
        </p>
        {bt?.active && (
          <p style={{ fontSize: 13, color: '#16a34a', margin: '0 0 12px' }}>
            On air now: {bt.mode === 'live' ? 'live stream' : 'preroll'}{bt.board_channel_number ? ` · channel ${bt.board_channel_number}` : ''}
          </p>
        )}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <input placeholder="Board channel #" value={btChannel} onChange={e => setBtChannel(e.target.value)} style={{ ...inputStyle, width: 140 }} />
          <input placeholder="On-screen label (optional)" value={btLabel} onChange={e => setBtLabel(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" disabled={btSaving} onClick={() => void btPost('preroll')} style={{ padding: '10px 18px', background: '#1e6cb5', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>Start preroll</button>
          <button type="button" disabled={btSaving} onClick={() => void btPost('live')} style={{ padding: '10px 18px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>Go live</button>
          <button type="button" disabled={btSaving} onClick={() => void btPost('off')} style={{ padding: '10px 18px', background: 'transparent', color: text, border: `1px solid ${border}`, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>End takeover</button>
        </div>
      </div>
    </SignagePageShell>
  )
}
