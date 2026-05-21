/** Productions that should not appear on schedules, today views, or active pipeline. */
export function isActiveProductionStatus(status: string | null | undefined): boolean {
  const s = (status || '').trim()
  return s !== 'Complete' && s !== 'Abandoned'
}

/** For Supabase `.not('status', 'in', value)` filters. */
export const SUPABASE_NOT_INACTIVE_PRODUCTION_STATUSES = '("Complete","Abandoned")'
