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

const LABEL_ONLY_CAP = 40

function mergeProductionRows(rows: DashboardProduction[]): DashboardProduction[] {
  const byId = new Map<string, DashboardProduction>()
  for (const row of rows) {
    byId.set(row.id, row)
  }
  return [...byId.values()]
}

/**
 * Productions in the next 7 days — DB-bounded where possible, then normalized date filter.
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
    `and(start_datetime.is.null,event_date.gte.${startDate},event_date.lte.${endDate})`

  const [inWindowRes, labelOnlyRes] = await Promise.all([
    supabase
      .from('productions')
      .select(WEEK_PRODUCTION_SELECT)
      .not('status', 'in', SUPABASE_NOT_INACTIVE_PRODUCTION_STATUSES)
      .or(inWindowOr)
      .order('start_datetime', { ascending: true, nullsFirst: false }),
    supabase
      .from('productions')
      .select(WEEK_PRODUCTION_SELECT)
      .not('status', 'in', SUPABASE_NOT_INACTIVE_PRODUCTION_STATUSES)
      .is('start_datetime', null)
      .is('event_date', null)
      .limit(LABEL_ONLY_CAP),
  ])

  if (inWindowRes.error) throw inWindowRes.error
  if (labelOnlyRes.error) throw labelOnlyRes.error

  const merged = mergeProductionRows([
    ...((inWindowRes.data || []) as unknown as DashboardProduction[]),
    ...((labelOnlyRes.data || []) as unknown as DashboardProduction[]),
  ])

  return merged
    .map(row => normalizeProductionDatetimeFields(row))
    .filter(row => isProductionInDateWindow(row, windowStart, windowEnd))
    .sort((a, b) => {
      const aMs = a.start_datetime ? new Date(a.start_datetime).getTime() : 0
      const bMs = b.start_datetime ? new Date(b.start_datetime).getTime() : 0
      return aMs - bMs
    })
}
