export const SIGNAGE_ANNOUNCEMENT_ICONS = [
  { id: 'bell', emoji: '🔔', label: 'Bell' },
  { id: 'calendar', emoji: '📅', label: 'Calendar' },
  { id: 'megaphone', emoji: '📣', label: 'Megaphone' },
  { id: 'star', emoji: '⭐', label: 'Featured' },
  { id: 'celebration', emoji: '🎉', label: 'Celebration' },
  { id: 'info', emoji: 'ℹ️', label: 'Info' },
  { id: 'warning', emoji: '⚠️', label: 'Alert' },
  { id: 'food', emoji: '🍽️', label: 'Food & dining' },
  { id: 'tools', emoji: '🔧', label: 'Workshop' },
  { id: 'graduation', emoji: '🎓', label: 'Graduation' },
  { id: 'clock', emoji: '🕐', label: 'Schedule' },
  { id: 'heart', emoji: '❤️', label: 'Community' },
] as const

export type SignageAnnouncementIconId = (typeof SIGNAGE_ANNOUNCEMENT_ICONS)[number]['id']

const ICON_SET = new Set<string>(SIGNAGE_ANNOUNCEMENT_ICONS.map(i => i.id))

export function isSignageAnnouncementIcon(value: string): value is SignageAnnouncementIconId {
  return ICON_SET.has(value)
}

export function normalizeSignageAnnouncementIcon(value: string | null | undefined): SignageAnnouncementIconId {
  if (value && isSignageAnnouncementIcon(value)) return value
  return 'bell'
}

export function announcementIconEmoji(icon: string | null | undefined): string {
  const id = normalizeSignageAnnouncementIcon(icon)
  return SIGNAGE_ANNOUNCEMENT_ICONS.find(i => i.id === id)?.emoji ?? '🔔'
}

/** Scope badge on TV — omit center-wide; show area/screen names when targeted. */
export function announcementScopeLabel(
  row: {
    all_screens: boolean
    target_area_ids: string[] | null
    target_screen_ids: string[] | null
  },
  areaNameById: Map<string, string>,
  screenNameById: Map<string, string>,
): string | null {
  if (row.all_screens) return null

  const parts: string[] = []
  for (const id of row.target_area_ids ?? []) {
    const name = areaNameById.get(id)
    if (name) parts.push(name)
  }
  for (const id of row.target_screen_ids ?? []) {
    const name = screenNameById.get(id)
    if (name) parts.push(name)
  }
  if (!parts.length) return null
  if (parts.length <= 2) return parts.join(', ')
  return `${parts.slice(0, 2).join(', ')} +${parts.length - 2}`
}
