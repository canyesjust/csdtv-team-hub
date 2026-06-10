export type TargetableRow = {
  all_screens: boolean
  target_area_ids: string[] | null
  target_screen_ids: string[] | null
}

export type ScreenTarget = {
  id: string
  area_id: string | null
}

/** Whether a content/announcement/live row applies to this screen. */
export function signageTargetMatches(
  row: TargetableRow,
  screen: ScreenTarget,
): boolean {
  if (row.all_screens) return true
  const screenIds = row.target_screen_ids ?? []
  if (screenIds.includes(screen.id)) return true
  if (screen.area_id) {
    const areaIds = row.target_area_ids ?? []
    if (areaIds.includes(screen.area_id)) return true
  }
  return false
}

import { signageTodayDateString } from './constants'

export function todayDateString(): string {
  return signageTodayDateString()
}

export function isInDateRange(startDate: string, endDate: string, today: string): boolean {
  return startDate <= today && today <= endDate
}
