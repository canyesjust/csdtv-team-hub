import type { SupabaseClient } from '@supabase/supabase-js'

const TTL_MS = 5 * 60 * 1000

type CacheEntry<T> = { at: number; data: T }

let channelsCache: CacheEntry<
  {
    id: string
    channel_number: number
    channel_name: string
    view_type?: string
    tier?: string
    obs_polling_enabled?: boolean
  }[]
> | null = null

export function invalidateOutputChannelsCache() {
  channelsCache = null
}

let timerTemplatesCache: CacheEntry<{ id: string; name: string; duration_seconds?: number }[]> | null = null

function fresh<T>(entry: CacheEntry<T> | null): entry is CacheEntry<T> {
  return !!entry && Date.now() - entry.at < TTL_MS
}

export async function getCachedOutputChannels(service: SupabaseClient) {
  if (fresh(channelsCache)) return channelsCache.data
  const { data } = await service
    .from('output_channels')
    .select('id, channel_number, channel_name, view_type, tier, obs_polling_enabled')
    .eq('is_active', true)
    .order('channel_number')
  const rows = data || []
  channelsCache = { at: Date.now(), data: rows }
  return rows
}

export async function getCachedTimerTemplates(service: SupabaseClient) {
  if (fresh(timerTemplatesCache)) return timerTemplatesCache.data
  const { data } = await service.from('timer_templates').select('*').order('sort_order', { ascending: true })
  const rows = (data || []).map(t => ({
    id: t.id,
    name: t.name,
    duration_seconds: t.duration_seconds ?? undefined,
  }))
  timerTemplatesCache = { at: Date.now(), data: rows }
  return rows
}
