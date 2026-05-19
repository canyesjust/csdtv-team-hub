'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/lib/toast'
import { INFO_CARD_LABELS, type MeetingPlaylistRow, type PlaylistItemRow } from '@/lib/board-meetings/playlist-types'

type ItemRow = PlaylistItemRow

export default function PlaylistLiveControls({
  productionId,
  disabled,
  onUpdated,
}: {
  productionId: string
  disabled?: boolean
  onUpdated?: () => void
}) {
  const [playlist, setPlaylist] = useState<MeetingPlaylistRow | null>(null)
  const [items, setItems] = useState<ItemRow[]>([])
  const [busy, setBusy] = useState(false)

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'

  const load = useCallback(async () => {
    const res = await fetch(`/api/board-meetings/${productionId}/playlist`)
    const body = await res.json()
    if (!res.ok) return
    setPlaylist(body.playlist)
    setItems(body.items || [])
  }, [productionId])

  useEffect(() => { load() }, [load])

  const post = async (path: string, body?: Record<string, unknown>) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/board-meetings/${productionId}/playlist/${path}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json()
      if (!res.ok) toast(data.error || 'Action failed', 'error')
      else {
        await load()
        onUpdated?.()
      }
    } finally {
      setBusy(false)
    }
  }

  if (!playlist) {
    return <p style={{ fontSize: '13px', color: muted, margin: 0 }}>No pre-roll playlist. Add one from the production Board Meeting tab.</p>
  }

  const active = playlist.playback_state !== 'idle'
  const btn: React.CSSProperties = {
    fontSize: '13px',
    padding: '10px 12px',
    minHeight: '44px',
    borderRadius: '8px',
    border: `0.5px solid ${border}`,
    background: 'transparent',
    color: text,
    cursor: disabled || busy ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    opacity: disabled || busy ? 0.5 : 1,
  }

  return (
    <div>
      <p style={{ margin: '0 0 10px', fontSize: '12px', color: muted }}>
        Playback: <strong style={{ color: text }}>{playlist.playback_state}</strong>
        {playlist.held_item_id ? ' (held)' : ''}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
        {!active ? (
          <button type="button" style={btn} disabled={disabled || busy || items.length === 0} onClick={() => post('play')}>Play</button>
        ) : playlist.playback_state === 'paused' ? (
          <button type="button" style={btn} disabled={disabled || busy} onClick={() => post('play')}>Resume</button>
        ) : (
          <button type="button" style={btn} disabled={disabled || busy} onClick={() => post('pause')}>Pause</button>
        )}
        <button type="button" style={btn} disabled={disabled || busy || !active} onClick={() => post('skip')}>Skip</button>
        <button type="button" style={btn} disabled={disabled || busy || !active} onClick={() => post('back')}>Back</button>
        {playlist.held_item_id ? (
          <button type="button" style={btn} disabled={disabled || busy} onClick={() => post('release-hold')}>Release hold</button>
        ) : (
          <button type="button" style={btn} disabled={disabled || busy || !active} onClick={() => post('hold')}>Hold</button>
        )}
        <button type="button" style={btn} disabled={disabled || busy || !active} onClick={() => post('end')}>End</button>
      </div>
      <div>
        {items.map(it => (
          <button
            key={it.id}
            type="button"
            disabled={disabled || busy}
            onClick={() => post('jump-to', { item_id: it.id })}
            style={{
              textAlign: 'left',
              padding: '8px 10px',
              borderRadius: '8px',
              border: `0.5px solid ${it.id === playlist.current_item_id ? 'var(--brand-primary)' : border}`,
              background: it.id === playlist.current_item_id ? 'rgba(30,108,181,0.12)' : 'transparent',
              cursor: disabled || busy ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              color: text,
              fontSize: '13px',
            }}
          >
            {it.label}
            <span style={{ display: 'block', fontSize: '11px', color: muted }}>{INFO_CARD_LABELS[it.item_type] || it.item_type}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

