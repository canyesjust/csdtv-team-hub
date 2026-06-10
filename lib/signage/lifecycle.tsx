// Shared lifecycle helpers for signage items that show on a schedule.
// Used by content, announcements, and visitors admin pages so every page
// consistently shows what is currently on, what is coming, and what has passed.

export type Lifecycle = 'active' | 'upcoming' | 'expired' | 'none'

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// Items with a start AND end date (content, announcements).
export function dateRangeLifecycle(start: string | null, end: string | null, today: string): Lifecycle {
  const s = start?.slice(0, 10)
  const e = end?.slice(0, 10)
  if (!s || !e) return 'none'
  if (e < today) return 'expired'
  if (s > today) return 'upcoming'
  return 'active'
}

// Items with a single day (visitors).
export function singleDateLifecycle(date: string | null, today: string): Lifecycle {
  const d = date?.slice(0, 10)
  if (!d) return 'none'
  if (d < today) return 'expired'
  if (d > today) return 'upcoming'
  return 'active'
}

export const LIFECYCLE_META: Record<Lifecycle, { label: string; color: string; bg: string }> = {
  active: { label: 'Showing now', color: '#16a34a', bg: 'rgba(34,197,94,0.14)' },
  upcoming: { label: 'Scheduled', color: '#2563eb', bg: 'rgba(37,99,235,0.12)' },
  expired: { label: 'Ended', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  none: { label: '', color: '#6b7280', bg: 'transparent' },
}

// Sort order: showing now first, then upcoming, then undated, then ended.
export const LIFECYCLE_RANK: Record<Lifecycle, number> = { active: 0, upcoming: 1, none: 2, expired: 3 }

// Group headings used when a page splits items into sections.
export const LIFECYCLE_GROUPS: { key: Lifecycle; heading: string }[] = [
  { key: 'active', heading: 'Showing now' },
  { key: 'upcoming', heading: 'Coming up' },
  { key: 'expired', heading: 'Passed' },
  { key: 'none', heading: 'No dates set' },
]

export function LifecyclePill({ lifecycle }: { lifecycle: Lifecycle }) {
  const meta = LIFECYCLE_META[lifecycle]
  if (!meta.label) return null
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 11,
        fontWeight: 600,
        color: meta.color,
        background: meta.bg,
        borderRadius: 999,
        padding: '2px 9px',
        whiteSpace: 'nowrap',
      }}
    >
      {meta.label}
    </span>
  )
}
