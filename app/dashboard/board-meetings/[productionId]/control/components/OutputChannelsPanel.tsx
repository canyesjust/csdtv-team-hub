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
  const assignmentByChannel = new Map(
    (assignments || []).map(a => [a.output_channel_id, a]),
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {(channels || []).map(ch => {
        const assignment = assignmentByChannel.get(ch.id)
        const isAssigned = !!assignment
        const listening = !!ch.obs_polling_enabled
        const showIdent = !!assignment?.show_channel_ident
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <input
                type="checkbox"
                checked={isAssigned}
                disabled={!canControl}
                onChange={() => onAction('toggle-channel', { output_channel_id: ch.id })}
              />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Ch {ch.channel_number} — {ch.channel_name}
              </span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  cursor: canControl && isAssigned ? 'pointer' : 'default',
                  opacity: isAssigned ? 1 : 0.45,
                }}
                title={
                  isAssigned
                    ? 'Show channel ID card on this output (blank when off)'
                    : 'Assign the channel first'
                }
              >
                <span>ID</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={showIdent}
                  disabled={!canControl || !isAssigned}
                  onChange={() =>
                    onAction('toggle-channel-ident', {
                      output_channel_id: ch.id,
                      show: !showIdent,
                    })
                  }
                />
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
          </div>
        )
      })}
    </div>
  )
}
