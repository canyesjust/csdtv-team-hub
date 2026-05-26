export type WeekdaySchedule = {
  monday: string
  tuesday: string
  wednesday: string
  thursday: string
  friday: string
}

export const WEEKDAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number]

export function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Monday of the week containing `d`, as YYYY-MM-DD in local time. */
export function getMondayStr(d: Date): string {
  const copy = new Date(d)
  const dow = copy.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  copy.setDate(copy.getDate() + diff)
  return toLocalDateStr(copy)
}

export function weekdayKeyFromDate(d: Date): WeekdayKey | null {
  const dow = d.getDay()
  if (dow === 0 || dow === 6) return null
  return WEEKDAY_KEYS[dow - 1]
}

/** Default schedule with optional weekly override for one weekday. */
export function resolveDayHours(
  userId: string,
  date: Date,
  defaults: Array<WeekdaySchedule & { user_id: string }>,
  overrides: Array<WeekdaySchedule & { user_id: string; week_start: string }>,
): string | null {
  const dayKey = weekdayKeyFromDate(date)
  if (!dayKey) return null

  const weekStart = getMondayStr(date)
  const override = overrides.find((o) => o.user_id === userId && o.week_start === weekStart)
  if (override && override[dayKey] !== null && override[dayKey] !== undefined) {
    return override[dayKey] || null
  }

  const def = defaults.find((d) => d.user_id === userId)
  return def ? def[dayKey] || null : null
}
