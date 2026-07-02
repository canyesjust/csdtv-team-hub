export type TargetableRow = {
  all_screens: boolean
  target_area_ids: string[] | null
  target_screen_ids: string[] | null
  target_buildings?: string[] | null
}

export type ScreenTarget = {
  id: string
  area_id: string | null
  building?: string | null
}

/** Normalize Postgres date / ISO strings to YYYY-MM-DD for comparisons. */
export function normalizeSignageDate(value: string | null | undefined): string {
  if (!value) return ''
  const s = String(value).trim()
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : s
}

function normId(id: string): string {
  return id.trim().toLowerCase()
}

/** Whether a content/announcement/live row applies to this screen. */
export function signageTargetMatches(
  row: TargetableRow,
  screen: ScreenTarget,
): boolean {
  if (row.all_screens) return true
  const screenIds = (row.target_screen_ids ?? []).map(normId)
  if (screenIds.includes(normId(screen.id))) return true
  if (screen.area_id) {
    const areaIds = (row.target_area_ids ?? []).map(normId)
    if (areaIds.includes(normId(screen.area_id))) return true
  }
  if (screen.building && screen.building.trim()) {
    const buildings = (row.target_buildings ?? []).map(b => normId(String(b)))
    if (buildings.includes(normId(screen.building))) return true
  }
  return false
}

import { signageTodayDateString } from './constants'

export function todayDateString(): string {
  return signageTodayDateString()
}

export function isInDateRange(startDate: string, endDate: string, today: string): boolean {
  const start = normalizeSignageDate(startDate)
  const end = normalizeSignageDate(endDate)
  const day = normalizeSignageDate(today)
  if (!start || !end || !day) return false
  return start <= day && day <= end
}
