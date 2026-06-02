import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DISTRICT_SYNC_FINALIZED_KEY,
  DISTRICT_SYNC_SESSION_MAX_AGE_MS,
  DISTRICT_SYNC_STARTED_KEY,
  type DistrictSyncPendingProduction,
} from '@/lib/district-sync'

async function readSetting(service: SupabaseClient, key: string): Promise<string | null> {
  const { data } = await service.from('app_settings').select('value').eq('key', key).maybeSingle()
  const v = data?.value
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

async function writeSetting(service: SupabaseClient, key: string, value: string | null) {
  if (value === null) {
    await service.from('app_settings').delete().eq('key', key)
    return
  }
  await service.from('app_settings').upsert({
    key,
    value,
    updated_at: new Date().toISOString(),
  })
}

export async function getDistrictSyncSession(service: SupabaseClient) {
  const startedAt = await readSetting(service, DISTRICT_SYNC_STARTED_KEY)
  const finalizedAt = await readSetting(service, DISTRICT_SYNC_FINALIZED_KEY)
  return { startedAt, finalizedAt }
}

/** Start (or refresh) the active district sync window — called from Hub after extension sync. */
export async function beginDistrictSyncSession(service: SupabaseClient): Promise<string> {
  const now = new Date().toISOString()
  await writeSetting(service, DISTRICT_SYNC_STARTED_KEY, now)
  return now
}

/**
 * After district extension sync: flag Hub productions not seen since session start.
 * Never deletes rows.
 */
export async function finalizeDistrictSyncSession(
  service: SupabaseClient,
): Promise<{ startedAt: string; flagged: number }> {
  let startedAt = await readSetting(service, DISTRICT_SYNC_STARTED_KEY)
  if (!startedAt) {
    startedAt = await beginDistrictSyncSession(service)
  }

  const now = new Date().toISOString()
  const { data: flaggedRows, error } = await service
    .from('productions')
    .update({ district_missing_since: now })
    .is('district_missing_since', null)
    .or(`last_seen_in_district_sync_at.is.null,last_seen_in_district_sync_at.lt.${startedAt}`)
    .select('id')

  if (error) throw new Error(error.message)

  const finalizedAt = new Date().toISOString()
  await writeSetting(service, DISTRICT_SYNC_FINALIZED_KEY, finalizedAt)
  await writeSetting(service, DISTRICT_SYNC_STARTED_KEY, null)

  return { startedAt, flagged: flaggedRows?.length ?? 0 }
}

export async function listPendingDistrictRemovals(
  service: SupabaseClient,
): Promise<DistrictSyncPendingProduction[]> {
  const { data, error } = await service
    .from('productions')
    .select(
      'id, production_number, title, status, organizer_name, school_department, synced_at, last_seen_in_district_sync_at, district_missing_since',
    )
    .not('district_missing_since', 'is', null)
    .order('district_missing_since', { ascending: false })

  if (error) throw new Error(error.message)
  return (data || []) as DistrictSyncPendingProduction[]
}

export async function dismissDistrictRemoval(service: SupabaseClient, productionId: string) {
  const { error } = await service
    .from('productions')
    .update({ district_missing_since: null })
    .eq('id', productionId)
  if (error) throw new Error(error.message)
}

export async function archiveDistrictRemoval(service: SupabaseClient, productionId: string) {
  const { error } = await service
    .from('productions')
    .update({ status: 'Abandoned', district_missing_since: null })
    .eq('id', productionId)
  if (error) throw new Error(error.message)
}

export async function deleteProductionFromHub(service: SupabaseClient, productionId: string) {
  await service.from('videos').update({ production_id: null }).eq('production_id', productionId)
  await service
    .from('dismissed_conflicts')
    .delete()
    .or(`production_a_id.eq.${productionId},production_b_id.eq.${productionId}`)

  const { error } = await service.from('productions').delete().eq('id', productionId)
  if (error) throw new Error(error.message)
}

/** Used by sync-productions edge function. */
export async function ensureActiveDistrictSyncSession(service: SupabaseClient): Promise<string> {
  const existing = await readSetting(service, DISTRICT_SYNC_STARTED_KEY)
  if (existing) {
    const age = Date.now() - Date.parse(existing)
    if (age >= 0 && age < DISTRICT_SYNC_SESSION_MAX_AGE_MS) return existing
  }
  return beginDistrictSyncSession(service)
}

export async function touchProductionsSeenInSync(
  service: SupabaseClient,
  productionNumbers: number[],
) {
  if (productionNumbers.length === 0) return
  const now = new Date().toISOString()
  const { error } = await service
    .from('productions')
    .update({
      last_seen_in_district_sync_at: now,
      district_missing_since: null,
    })
    .in('production_number', productionNumbers)
  if (error) throw new Error(error.message)
}
