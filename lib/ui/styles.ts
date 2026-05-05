import type { CSSProperties } from 'react'

export const uiStyles = {
  card: {
    background: 'var(--surface-1)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '16px',
  } as CSSProperties,
  cardSoft: {
    background: 'var(--surface-2)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
  } as CSSProperties,
  panelHeader: {
    borderBottom: '1px solid var(--border-subtle)',
    padding: '16px 20px',
  } as CSSProperties,
  actionLink: {
    color: 'var(--link)',
    textDecoration: 'none',
    fontWeight: 600,
  } as CSSProperties,
  mutedText: {
    color: 'var(--text-muted)',
  } as CSSProperties,
}

export const statusTone = {
  success: { color: 'var(--status-success)', background: 'var(--status-success-bg)' },
  warning: { color: 'var(--status-warning)', background: 'var(--status-warning-bg)' },
  danger: { color: 'var(--status-danger)', background: 'var(--status-danger-bg)' },
  review: { color: 'var(--status-review)', background: 'var(--status-review-bg)' },
  info: { color: 'var(--status-info)', background: 'var(--status-info-bg)' },
}
