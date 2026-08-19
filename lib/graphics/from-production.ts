import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isGraphicsCandidate, type ProductionSummary } from '@/lib/graphics/production-map'

export type { ProductionSummary } from '@/lib/graphics/production-map'
export {
  guessEventType, guessSchoolCode, guessVenue, normalizeSchoolCode, productionDate, isGraphicsCandidate,
} from '@/lib/graphics/production-map'

const COLUMNS =
  'id, production_number, title, status, event_date, start_datetime, end_datetime, location, event_location, filming_location, school_department, internal_type_label, video_shoot_type'

/**
 * Upcoming productions worth putting graphics on.
 *
 * The filter is on `start_datetime`, not `event_date`. Every record in this
 * database has a start time and none of them has an event date, so filtering on
 * the date column returned an empty list and the picker silently never showed.
 */
export async function listProductionsForGraphics(
  service: SupabaseClient,
  limit = 80,
): Promise<ProductionSummary[]> {
  const since = new Date(Date.now() - 14 * 24 * 3600_000).toISOString()
  const { data } = await service
    .from('productions')
    .select(COLUMNS)
    .gte('start_datetime', since)
    .order('start_datetime', { ascending: true })
    .limit(limit)
  return ((data || []) as ProductionSummary[]).filter(isGraphicsCandidate)
}

/** One production by id, for linking a show that already exists. */
export async function getProductionForGraphics(
  service: SupabaseClient,
  productionId: string,
): Promise<ProductionSummary | null> {
  const { data } = await service
    .from('productions').select(COLUMNS).eq('id', productionId).maybeSingle()
  return (data as ProductionSummary | null) ?? null
}
