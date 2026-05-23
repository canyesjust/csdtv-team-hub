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

  const siteBase = typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_SITE_URL || '')

  if (loading) return <Loader />

  return (
    <div>
      <p style={{ fontSize: '13px', color: muted, margin: '0 0 12px', lineHeight: 1.5, maxWidth: '720px' }}>
        For OBS browser sources you leave open between meetings, use the <strong style={{ color: text }}>Standby</strong>{' '}
        URL so the page does not poll the server. Remove <code style={{ fontSize: '12px' }}>?standby=1</code> (or switch
        to the live URL) when you assign the channel and go live.
      </p>
      <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', background: cardBg, borderRadius: '12px', border: `0.5px solid ${border}` }}>
        <thead>
          <tr style={{ borderBottom: `0.5px solid ${border}`, textAlign: 'left' }}>
            <th style={{ padding: '12px 14px', color: muted, fontWeight: 600 }}>#</th>
            <th style={{ padding: '12px 14px', color: muted, fontWeight: 600 }}>Name</th>
            <th style={{ padding: '12px 14px', color: muted, fontWeight: 600 }}>View</th>
            <th style={{ padding: '12px 14px', color: muted, fontWeight: 600 }}>Tier</th>
            <th style={{ padding: '12px 14px', color: muted, fontWeight: 600 }}>Secret</th>
            <th style={{ padding: '12px 14px', color: muted, fontWeight: 600 }}>URLs</th>
            <th style={{ padding: '12px 14px', color: muted, fontWeight: 600 }}></th>
          </tr>
        </thead>
        <tbody>
          {channels.map(ch => {
            const slug = ch.view_type === 'second_screen' ? 'live' : ch.view_type
            const publicUrl = siteBase ? `${siteBase}/board/${ch.channel_number}/${slug}` : ''
            const standbyUrl = publicUrl ? `${publicUrl}?standby=1` : ''
            const fullscreenUrl =
              ch.view_type === 'dais' && publicUrl ? `${publicUrl}?fullscreen=1` : ''
            return (
              <tr key={ch.id} style={{ borderBottom: `0.5px solid ${border}` }}>
                <td style={{ padding: '12px 14px', color: text, fontWeight: 600 }}>{ch.channel_number}</td>
                <td style={{ padding: '12px 14px', color: text }}>{ch.channel_name}</td>
                <td style={{ padding: '12px 14px', color: muted }}>{VIEW_LABELS[ch.view_type] || ch.view_type}</td>
                <td style={{ padding: '12px 14px', color: muted, textTransform: 'capitalize' }}>{ch.tier}</td>
                <td style={{ padding: '12px 14px', color: muted, fontFamily: 'monospace', fontSize: '12px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ch.access_secret}</td>
                <td style={{ padding: '12px 14px', fontSize: '12px' }}>
                  {publicUrl ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <a href={standbyUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-primary)' }}>
                        {standbyUrl}
                        <span style={{ color: muted }}> (standby — use in OBS between meetings)</span>
                      </a>
                      <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={{ color: muted, fontSize: '12px' }}>
                        Live: {publicUrl}
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
