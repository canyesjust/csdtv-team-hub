import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export type BoardViewSlug = 'overlay' | 'preroll' | 'live' | 'dais'

const VIEW_MAP: Record<BoardViewSlug, string> = {
  overlay: 'overlay',
  preroll: 'preroll',
  live: 'second_screen',
  dais: 'dais',
}

export function viewSlugToDbType(slug: BoardViewSlug): string {
  return VIEW_MAP[slug]
}

export async function getOutputChannelByNumber(channelNumber: number) {
  const service = getServiceSupabaseClient()
  if (!service) return null
  const { data } = await service
    .from('output_channels')
    .select('id, channel_number, channel_name, view_type, tier')
    .eq('channel_number', channelNumber)
    .eq('is_active', true)
    .maybeSingle()
  return data
}
