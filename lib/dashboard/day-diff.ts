export const DAY_MS = 86400000

export function dayDiffFromToday(input: string | Date | null): number | null {
  if (!input) return null
  const target = new Date(input)
  if (Number.isNaN(target.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / DAY_MS)
}
