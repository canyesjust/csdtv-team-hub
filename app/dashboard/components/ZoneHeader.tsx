import type { ReactNode } from 'react'
import { uiStyles } from '@/lib/ui/styles'

interface ZoneHeaderProps {
  label: string
  hint?: string
  accent?: string
  action?: ReactNode
}

export function ZoneHeader({ label, hint, accent, action }: ZoneHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', margin: '0 0 14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', minWidth: 0 }}>
        <span style={{ ...uiStyles.zoneLabel, color: accent || 'var(--text-muted)' }}>{label}</span>
        {hint && (
          <span
            style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {hint}
          </span>
        )}
      </div>
      <div style={uiStyles.zoneRule} />
      {action}
    </div>
  )
}
