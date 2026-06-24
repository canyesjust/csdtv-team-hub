import type { SupabaseClient } from '@supabase/supabase-js'
import type { AbleSignCreds } from '@/lib/server/ablesign'

/**
 * Resolve the AbleSign credentials for a signage site. Returns the site's own
 * api key / workspace id when set; blank fields fall back to the server-wide
 * ABLESIGN_* env vars (handled downstream in lib/server/ablesign.ts).
 */
export async function getSiteAbleSignCreds(
  service: SupabaseClient,
  siteId: string | null | undefined,
): Promise<AbleSignCreds> {
  if (!siteId) return {}
  const { data } = await service
    .from('signage_sites')
    .select('ablesign_api_key, ablesign_workspace_id')
    .eq('id', siteId)
    .maybeSingle()
  return {
    apiKey: data?.ablesign_api_key ?? null,
    workspaceId: data?.ablesign_workspace_id ?? null,
  }
}
