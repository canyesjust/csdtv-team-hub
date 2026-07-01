import type { SupabaseClient } from '@supabase/supabase-js'

// The brand-library bucket is PRIVATE. Files are served only via short-lived signed
// URLs so a copied link stops working after the TTL (prevents permanent hotlinking).
export const BRAND_BUCKET = 'school-logos'
export const BRAND_URL_TTL = 60 * 60 // 1 hour

type SignOptions = {
  download?: string | boolean
  transform?: { width?: number; height?: number; quality?: number; resize?: 'cover' | 'contain' | 'fill' }
}

/** Create a signed URL for a brand file, or null on failure. */
export async function signBrandUrl(
  service: SupabaseClient,
  path: string,
  options?: SignOptions,
): Promise<string | null> {
  const { data } = await service.storage.from(BRAND_BUCKET).createSignedUrl(path, BRAND_URL_TTL, options)
  return data?.signedUrl ?? null
}
