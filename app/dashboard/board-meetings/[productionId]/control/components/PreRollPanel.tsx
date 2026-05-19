'use client'

import type { ControlBundle } from '@/lib/board-meetings/types'

type Props = {
  canControl: boolean
  state: ControlBundle['playlist_state']
  meetingPlaylist: ControlBundle['meeting_playlist']
  onAction: (action: string, body?: unknown) => Promise<void>
}

export default function PreRollPanel({ canControl, state, meetingPlaylist, onAction }: Props) {
  const playlist = meetingPlaylist as { items?: { id: string; label: string; item_type: string }[] } | null
  const items = playlist?.items || []
  const playback = state?.playback_state || 'idle'
  const disabled = !canControl

  const act = (action: string, body?: unknown) => {
    void onAction(`playlist-${action}`, body)
  }

  if (!meetingPlaylist) {
    return <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No pre-roll playlist.</p>
  }

  return (
    <>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-muted)' }}>
        Playback: <strong>{playback}</strong>
      </p>
      <div className="control-btn-row" style={{ marginBottom: 12 }}>
        {playback === 'idle' ? (
          <button type="button" className="cs-touchbtn" disabled={disabled || items.length === 0} onClick={() => act('play')}>Play</button>
        ) : playback === 'paused' ? (
          <button type="button" className="cs-touchbtn" disabled={disabled} onClick={() => act('play')}>Resume</button>
        ) : (
          <button type="button" className="cs-touchbtn" disabled={disabled} onClick={() => act('pause')}>Pause</button>
        )}
        <button type="button" className="cs-touchbtn" disabled={disabled || playback === 'idle'} onClick={() => act('skip')}>Skip</button>
        <button type="button" className="cs-touchbtn" disabled={disabled || playback === 'idle'} onClick={() => act('back')}>Back</button>
        <button type="button" className="cs-touchbtn" disabled={disabled || playback === 'idle'} onClick={() => act('end')}>End</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(it => (
          <button
            key={it.id}
            type="button"
            className="cs-touchbtn"
            disabled={disabled}
            onClick={() => act('jump-to', { item_id: it.id })}
            style={{ textAlign: 'left' }}
          >
            {it.label}
          </button>
        ))}
      </div>
    </>
  )
}
