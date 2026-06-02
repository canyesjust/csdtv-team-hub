import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isProductionInDateWindow,
  normalizeProductionDatetimeFields,
} from '@/lib/productions/effective-datetime'
import { SUPABASE_NOT_INACTIVE_PRODUCTION_STATUSES } from '@/lib/productions/status-filters'
import type { DashboardProduction } from '@/lib/dashboard/load-dashboard-sections'

/** Columns needed for This Week + attention heuristics (prep % uses checklist completed only). */
export const WEEK_PRODUCTION_SELECT =
  'id, title, production_number, request_type_label, type, status, school_year, start_datetime, start_datetime_label, event_date, filming_location, school_department, production_members(user_id, team(name, avatar_color)), checklist_items(completed)'

/**
 * Productions in the next 7 days — filter on persisted start_datetime / event_date (sync trigger fills start_datetime).
 */
export async function fetchWeekProductions(
  supabase: SupabaseClient,
  windowStart: Date,
  windowEnd: Date,
): Promise<DashboardProduction[]> {
  const startIso = windowStart.toISOString()
  const endIso = windowEnd.toISOString()
  const startDate = startIso.split('T')[0]
  const endDate = endIso.split('T')[0]

  const inWindowOr =
    `and(start_datetime.gte.${startIso},start_datetime.lte.${endIso}),` +
    `and(event_date.gte.${startDate},event_date.lte.${endDate})`

  const { data, error } = await supabase
    .from('productions')
    .select(WEEK_PRODUCTION_SELECT)
    .not('status', 'in', SUPABASE_NOT_INACTIVE_PRODUCTION_STATUSES)
    .or(inWindowOr)
    .order('start_datetime', { ascending: true, nullsFirst: false })

  if (error) throw error

  return ((data || []) as unknown as DashboardProduction[])
    .map(row => normalizeProductionDatetimeFields(row))
    .filter(row => isProductionInDateWindow(row, windowStart, windowEnd))
    .sort((a, b) => {
      const aMs = a.start_datetime ? new Date(a.start_datetime).getTime() : 0
      const bMs = b.start_datetime ? new Date(b.start_datetime).getTime() : 0
      return aMs - bMs
    })
}
