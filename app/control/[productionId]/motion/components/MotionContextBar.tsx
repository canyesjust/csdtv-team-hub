'use client'

import type { ControlAgendaItem } from '@/lib/board-meetings/types'

type StatusPill = {
  label: string
  variant: 'info' | 'warning' | 'success' | 'danger'
  icon?: string
}

const VARIANT_STYLES: Record<StatusPill['variant'], { bg: string; border: string; text: string }> = {
  info: {
    bg: 'var(--semantic-info-bg)',
    border: 'var(--semantic-info-border)',
    text: 'var(--semantic-info-text)',
  },
  warning: {
    bg: 'var(--semantic-warning-bg)',
    border: 'var(--semantic-warning-border)',
    text: 'var(--semantic-warning-text)',
  },
  success: {
    bg: 'var(--semantic-success-bg)',
    border: 'var(--semantic-success-border)',
    text: 'var(--semantic-success-text)',
  },
  danger: {
    bg: 'var(--semantic-danger-bg)',
    border: 'var(--semantic-danger-border)',
    text: 'var(--semantic-danger-text)',
  },
}

const ICON_GLYPH: Record<string, string> = {
  pencil: '✎',
  'message-circle': '💬',
  'circle-check': '◎',
  replace: '⤴',
}

type Props = {
  agendaItem: ControlAgendaItem | null
  statusPill: StatusPill
}

export default function MotionContextBar({ agendaItem, statusPill }: Props) {
  const pillStyle = VARIANT_STYLES[statusPill.variant]
  const icon = statusPill.icon ? ICON_GLYPH[statusPill.icon] ?? '•' : null

  return (
    <div className="ms-context">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {agendaItem ? (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                ITEM {agendaItem.item_number}
              </div>
              <div style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                {agendaItem.title}
              </div>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>No agenda item selected</p>
          )}
        </div>
        <span
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.04em',
            background: pillStyle.bg,
            border: `0.5px solid ${pillStyle.border}`,
            color: pillStyle.text,
          }}
        >
          {icon && <span aria-hidden>{icon}</span>}
          {statusPill.label}
        </span>
      </div>
    </div>
  )
}
