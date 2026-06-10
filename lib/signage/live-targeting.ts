import type { TargetableRow } from './targeting'
import { signageTargetMatches, type ScreenTarget } from './targeting'

/** Ensure live rows with no explicit targets still reach all screens when flagged live. */
export function normalizeSignageLiveTargeting<T extends TargetableRow>(row: T): T {
  if (row.all_screens) return row
  const areas = row.target_area_ids ?? []
  const screens = row.target_screen_ids ?? []
  if (areas.length === 0 && screens.length === 0) {
    return { ...row, all_screens: true, target_area_ids: [], target_screen_ids: [] }
  }
  return row
}

export function signageLiveMatchesScreen(
  row: TargetableRow | null | undefined,
  screen: ScreenTarget,
): boolean {
  if (!row) return false
  return signageTargetMatches(normalizeSignageLiveTargeting(row), screen)
}
