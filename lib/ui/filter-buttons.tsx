import { statusTone } from '@/lib/ui/styles'

/**
 * Filter pill buttons shared by the Tasks and Productions dashboards
 * (previously duplicated inline in both pages).
 */

const muted = 'var(--text-muted)'
const border = 'var(--border-subtle)'
const cardBg = 'var(--surface-1)'
const surface2 = 'var(--surface-2)'

/** Rounded focus-filter pill with a count badge. */
export function FocusChip({
  label,
  count,
  tone,
  active,
  onClick,
}: {
  label: string
  count: number
  tone: keyof typeof statusTone | null
  active: boolean
  onClick: () => void
}) {
  const accent = tone ? statusTone[tone].color : muted
  const accentBg = tone ? statusTone[tone].background : surface2
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        padding: '8px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: 600,
        border: `1px solid ${active ? accent : border}`,
        background: active ? accentBg : cardBg,
        color: active ? accent : muted,
        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
        whiteSpace: 'nowrap' as const,
      }}
    >
      <span>{label}</span>
      <span style={{ fontSize: '11px', fontWeight: 700, padding: '1px 7px', borderRadius: '999px', background: active ? accentBg : surface2, color: active ? accent : muted, border: active ? `1px solid ${accent}` : 'none' }}>{count}</span>
    </button>
  )
}

/** Rectangular scope toggle (Mine / Team / Unassigned / All). */
export function ScopeButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
        border: `1px solid ${active ? 'var(--brand-primary)' : border}`,
        background: active ? 'var(--brand-primary)' : cardBg,
        color: active ? '#fff' : muted,
        cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  )
}
