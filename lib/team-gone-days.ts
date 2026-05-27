export interface ScheduleGoneDay {
  id: string
  user_id: string
  date: string
}

export function isGoneOnDate(
  userId: string,
  dateStr: string,
  goneDays: ScheduleGoneDay[],
): boolean {
  return goneDays.some((g) => g.user_id === userId && g.date === dateStr)
}

/** First names of team members marked out on a calendar date (sorted). */
export function goneFirstNamesForDate(
  dateStr: string,
  goneDays: ScheduleGoneDay[],
  team: Array<{ id: string; name: string }>,
): string[] {
  const ids = new Set(goneDays.filter((g) => g.date === dateStr).map((g) => g.user_id))
  return team
    .filter((m) => ids.has(m.id))
    .map((m) => m.name.split(' ')[0])
    .sort((a, b) => a.localeCompare(b))
}

/** Compact line for signage / calendar footers. */
export function formatGoneSignageLine(names: string[]): string | null {
  if (names.length === 0) return null
  if (names.length === 1) return `${names[0]} out`
  if (names.length <= 3) return `${names.join(', ')} out`
  return `${names.slice(0, 2).join(', ')} +${names.length - 2} out`
}
