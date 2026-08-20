import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export const IMAGE_BUCKET = 'graphics-images'

/** Public because an OBS browser source holds no session. */
export function imageUrl(service: SupabaseClient, path: string | null | undefined): string | null {
  if (!path) return null
  return service.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl
}

export async function sponsorLibraryWithArt(
  service: SupabaseClient,
): Promise<{ id: string; name: string; scope: 'district' | 'school'; logo_url: string | null }[]> {
  const { data } = await service
    .from('graphics_sponsors')
    .select('id, name, scope, logo_path')
    .eq('active', true)
    .order('sort_order')
  return ((data || []) as { id: string; name: string; scope: 'district' | 'school'; logo_path: string | null }[])
    .map(s => ({ id: s.id, name: s.name, scope: s.scope, logo_url: imageUrl(service, s.logo_path) }))
}
