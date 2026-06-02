export const DISTRICT_SYNC_STARTED_KEY = 'district_sync_active_started_at'
export const DISTRICT_SYNC_FINALIZED_KEY = 'district_sync_last_finalized_at'

/** Idle gap before a new extension sync run starts a fresh session window. */
export const DISTRICT_SYNC_SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000

export type DistrictSyncPendingProduction = {
  id: string
  production_number: number
  title: string
  status: string | null
  organizer_name: string | null
  school_department: string | null
  synced_at: string | null
  last_seen_in_district_sync_at: string | null
  district_missing_since: string
}

export function productionNumbersFromRows(rows: Record<string, unknown>[]): number[] {
  const out: number[] = []
  for (const row of rows) {
    const n = row.production_number
    if (typeof n === 'number' && Number.isFinite(n)) out.push(n)
    else if (typeof n === 'string' && n.trim() !== '' && Number.isFinite(Number(n))) {
      out.push(Number(n))
    }
  }
  return [...new Set(out)]
}
