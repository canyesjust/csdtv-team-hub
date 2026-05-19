'use client'

import type { ControlBundle } from '@/lib/board-meetings/types'

type Props = {
  canControl: boolean
  channels: ControlBundle['channels']
  assignments: ControlBundle['channel_assignments']
  onAction: (action: string, body?: unknown) => Promise<void>
}

export default function OutputChannelsPanel({ canControl, channels, assignments, onAction }: Props) {
  const assigned = new Set((assignments || []).map(a => a.output_channel_id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {(channels || []).map(ch => (
        <label key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, minHeight: 44 }}>
          <input
            type="checkbox"
            checked={assigned.has(ch.id)}
            disabled={!canControl}
            onChange={() => onAction('toggle-channel', { output_channel_id: ch.id })}
          />
          Ch {ch.channel_number} — {ch.channel_name}
        </label>
      ))}
    </div>
  )
}
