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
  panelLink: {
    color: 'var(--link)',
    textDecoration: 'none',
    fontWeight: 500,
    fontSize: '14px',
  } as CSSProperties,
  metricCard: {
    background: 'var(--surface-2)',
    borderRadius: '16px',
    border: '1px solid var(--border-subtle)',
    padding: '20px 24px',
    cursor: 'pointer',
    transition: 'transform var(--motion-fast) var(--ease-standard)',
  } as CSSProperties,
  mutedText: {
    color: 'var(--text-muted)',
  } as CSSProperties,
  zoneSection: {
    marginBottom: '32px',
  } as CSSProperties,
  zoneLabel: {
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '1.6px',
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
  } as CSSProperties,
  zoneRule: {
    flex: 1,
    height: '1px',
    background: 'var(--border-subtle)',
  } as CSSProperties,
}

export const statusTone = {
  success: { color: 'var(--status-success)', background: 'var(--status-success-bg)' },
  warning: { color: 'var(--status-warning)', background: 'var(--status-warning-bg)' },
  danger: { color: 'var(--status-danger)', background: 'var(--status-danger-bg)' },
  review: { color: 'var(--status-review)', background: 'var(--status-review-bg)' },
  info: { color: 'var(--status-info)', background: 'var(--status-info-bg)' },
}

export const statusBadge = (tone: keyof typeof statusTone, compact = false): CSSProperties => ({
  color: statusTone[tone].color,
  background: statusTone[tone].background,
  borderRadius: compact ? '6px' : '20px',
  padding: compact ? '2px 7px' : '4px 10px',
  fontWeight: 600,
})
