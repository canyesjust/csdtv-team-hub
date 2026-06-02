'use client'

import type { ControlBundle } from '@/lib/board-meetings/types'

type Props = {
  canControl: boolean
  channels: ControlBundle['channels']
  assignments: ControlBundle['channel_assignments']
  onAction: (action: string, body?: unknown) => Promise<void>
  onListeningChange?: (channelId: string, enabled: boolean) => void
}

export default function OutputChannelsPanel({
  canControl,
  channels,
  assignments,
  onAction,
  onListeningChange,
}: Props) {
  const assigned = new Set((assignments || []).map(a => a.output_channel_id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {(channels || []).map(ch => {
        const isAssigned = assigned.has(ch.id)
        const listening = !!ch.obs_polling_enabled
        return (
          <div
            key={ch.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              fontSize: 14,
              minHeight: 44,
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <input
                type="checkbox"
                checked={isAssigned}
                disabled={!canControl}
                onChange={() => onAction('toggle-channel', { output_channel_id: ch.id })}
              />
              Ch {ch.channel_number} — {ch.channel_name}
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: 'var(--text-muted)',
                cursor: canControl ? 'pointer' : 'default',
              }}
              title="When on, the OBS browser source polls for updates (auto on when assigned)"
            >
              <span>Listen</span>
              <input
                type="checkbox"
                role="switch"
                checked={listening}
                disabled={!canControl}
                onChange={() => onListeningChange?.(ch.id, !listening)}
              />
            </label>
          </div>
        )
      })}
    </div>
  )
}
