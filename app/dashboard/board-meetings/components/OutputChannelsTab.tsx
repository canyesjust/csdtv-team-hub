'use client'

import { useCallback, useEffect, useState } from 'react'
import Loader from '../../components/Loader'
import { toast } from '@/lib/toast'
import type { OutputChannel } from '@/lib/board-meetings/types'

const VIEW_LABELS: Record<string, string> = {
  overlay: 'Overlay',
  preroll: 'Pre-roll',
  second_screen: 'Second screen',
  dais: 'Dais',
}

export default function OutputChannelsTab() {
  const [channels, setChannels] = useState<OutputChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState<string | null>(null)
  const [togglingPoll, setTogglingPoll] = useState<string | null>(null)
  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'

  const load = useCallback(async () => {
    const res = await fetch('/api/output-channels')
    const body = await res.json()
    if (!res.ok) {
      toast(body.error || 'Failed to load channels', 'error')
      setLoading(false)
      return
    }
    setChannels(body.channels || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const regenerate = async (id: string) => {
    setRegenerating(id)
    const res = await fetch(`/api/output-channels/${id}/regenerate-secret`, { method: 'POST' })
    const body = await res.json()
    setRegenerating(null)
    if (!res.ok) {
      toast(body.error || 'Regenerate failed', 'error')
      return
    }
    toast('Secret regenerated', 'success')
    load()
  }

  const setListening = async (id: string, enabled: boolean) => {
    setTogglingPoll(id)
    const res = await fetch(`/api/output-channels/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ obs_polling_enabled: enabled }),
    })
    const body = await res.json()
    setTogglingPoll(null)
    if (!res.ok) {
      toast(body.error || 'Could not update listening', 'error')
      return
    }
    setChannels(prev =>
      prev.map(ch => (ch.id === id ? { ...ch, obs_polling_enabled: enabled } : ch)),
    )
  }

  const siteBase = typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_SITE_URL || '')

  if (loading) return <Loader />

  return (
    <div>
      <p style={{ fontSize: '13px', color: muted, margin: '0 0 12px', lineHeight: 1.5, maxWidth: '720px' }}>
        Put the <strong style={{ color: text }}>same URL</strong> in each OBS browser source and leave it open between
        meetings. Use <strong style={{ color: text }}>Listening</strong> to wake outputs before a show (or assign the
        channel on the control surface — that turns listening on automatically). Once the agenda is locked (pre-show) or
        you go live, outputs update in real time via Supabase and also poll about every 350&nbsp;ms as a fallback. Turn
        listening off after the meeting to go quiet again.
      </p>
      <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', background: cardBg, borderRadius: '12px', border: `0.5px solid ${border}` }}>
        <thead>
          <tr style={{ borderBottom: `0.5px solid ${border}`, textAlign: 'left' }}>
            <th style={{ padding: '12px 14px', color: muted, fontWeight: 600 }}>#</th>
            <th style={{ padding: '12px 14px', color: muted, fontWeight: 600 }}>Name</th>
            <th style={{ padding: '12px 14px', color: muted, fontWeight: 600 }}>View</th>
            <th style={{ padding: '12px 14px', color: muted, fontWeight: 600 }}>Listening</th>
            <th style={{ padding: '12px 14px', color: muted, fontWeight: 600 }}>Tier</th>
            <th style={{ padding: '12px 14px', color: muted, fontWeight: 600 }}>Secret</th>
            <th style={{ padding: '12px 14px', color: muted, fontWeight: 600 }}>URL</th>
            <th style={{ padding: '12px 14px', color: muted, fontWeight: 600 }}></th>
          </tr>
        </thead>
        <tbody>
          {channels.map(ch => {
            const slug = ch.view_type === 'second_screen' ? 'live' : ch.view_type
            const publicUrl = siteBase ? `${siteBase}/board/${ch.channel_number}/${slug}` : ''
            const fullscreenUrl =
              ch.view_type === 'dais' && publicUrl ? `${publicUrl}?fullscreen=1` : ''
            const listening = !!ch.obs_polling_enabled
            return (
              <tr key={ch.id} style={{ borderBottom: `0.5px solid ${border}` }}>
                <td style={{ padding: '12px 14px', color: text, fontWeight: 600 }}>{ch.channel_number}</td>
                <td style={{ padding: '12px 14px', color: text }}>{ch.channel_name}</td>
                <td style={{ padding: '12px 14px', color: muted }}>{VIEW_LABELS[ch.view_type] || ch.view_type}</td>
                <td style={{ padding: '12px 14px' }}>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: togglingPoll === ch.id ? 'wait' : 'pointer',
                      minHeight: 44,
                    }}
                  >
                    <input
                      type="checkbox"
                      role="switch"
                      checked={listening}
                      disabled={togglingPoll === ch.id}
                      onChange={() => void setListening(ch.id, !listening)}
                    />
                    <span style={{ fontSize: '13px', color: listening ? text : muted }}>
                      {listening ? 'On' : 'Off'}
                    </span>
                  </label>
                </td>
                <td style={{ padding: '12px 14px', color: muted, textTransform: 'capitalize' }}>{ch.tier}</td>
                <td style={{ padding: '12px 14px', color: muted, fontFamily: 'monospace', fontSize: '12px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ch.access_secret}</td>
                <td style={{ padding: '12px 14px', fontSize: '12px' }}>
                  {publicUrl ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-primary)' }}>
                        {publicUrl}
                      </a>
                      {fullscreenUrl ? (
                        <a href={fullscreenUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-primary)', fontSize: '12px' }}>
                          {fullscreenUrl} (full screen)
                        </a>
                      ) : null}
                    </div>
                  ) : '—'}
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <button
                    type="button"
                    onClick={() => regenerate(ch.id)}
                    disabled={regenerating === ch.id}
                    style={{ fontSize: '13px', padding: '8px 12px', minHeight: '44px', borderRadius: '8px', background: 'transparent', border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    {regenerating === ch.id ? '…' : 'Regenerate secret'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
    </div>
  )
}
