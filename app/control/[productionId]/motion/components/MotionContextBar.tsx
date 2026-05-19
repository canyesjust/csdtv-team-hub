'use client'

<<<<<<< HEAD
import type { AgendaItem } from '@/lib/board-meetings/types'
=======
import type { AgendaItem } from '@/lib/board-meetings/motion-types'
>>>>>>> 33c0c41 (Control surface and motion screen redesign)

type Pill = {
  label: string
  variant: 'info' | 'warning' | 'success' | 'danger'
  icon?: string
}

type Props = {
  agendaItem: AgendaItem | null
  statusPill: Pill
}

export default function MotionContextBar({ agendaItem, statusPill }: Props) {
  const pillStyle = pillVariantStyle(statusPill.variant)
  return (
    <div className="ms-context">
      <div>
        <div className="cs-eyebrow" style={{ marginBottom: 3 }}>
          MOTION ON ITEM · {agendaItem?.item_number || '—'}
        </div>
        <div style={{ fontSize: 15, fontWeight: 500 }}>
          {agendaItem?.title || 'No active agenda item'}
        </div>
      </div>
<<<<<<< HEAD
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 12px',
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.04em',
          ...pillStyle,
        }}
      >
=======
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 12px', borderRadius: 999,
        fontSize: 11, fontWeight: 500, letterSpacing: '0.04em',
        ...pillStyle,
      }}>
>>>>>>> 33c0c41 (Control surface and motion screen redesign)
        {statusPill.label}
      </span>
    </div>
  )
}

function pillVariantStyle(v: Pill['variant']) {
  switch (v) {
<<<<<<< HEAD
    case 'success':
      return { background: 'var(--semantic-success-bg)', color: 'var(--semantic-success-text)' }
    case 'danger':
      return { background: 'var(--semantic-danger-bg)', color: 'var(--semantic-danger-text)' }
    case 'warning':
      return { background: 'var(--semantic-warning-bg)', color: 'var(--semantic-warning-text)' }
    case 'info':
      return { background: 'var(--semantic-info-bg)', color: 'var(--semantic-info-text)' }
=======
    case 'success': return { background: 'var(--semantic-success-bg)', color: 'var(--semantic-success-text)' }
    case 'danger':  return { background: 'var(--semantic-danger-bg)',  color: 'var(--semantic-danger-text)'  }
    case 'warning': return { background: 'var(--semantic-warning-bg)', color: 'var(--semantic-warning-text)' }
    case 'info':    return { background: 'var(--semantic-info-bg)',    color: 'var(--semantic-info-text)'    }
>>>>>>> 33c0c41 (Control surface and motion screen redesign)
  }
}
