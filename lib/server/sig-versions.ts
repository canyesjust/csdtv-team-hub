import type { SupabaseClient } from '@supabase/supabase-js'
import { SIG_ASSETS_UPDATED_KEY, parseSigVersions } from '@/lib/sig-assets'

export async function loadSigVersions(
  service: SupabaseClient,
): Promise<Record<string, string>> {
  const { data } = await service
    .from('app_settings')
    .select('value')
    .eq('key', SIG_ASSETS_UPDATED_KEY)
    .maybeSingle()
  return parseSigVersions(data?.value ?? null)
}
