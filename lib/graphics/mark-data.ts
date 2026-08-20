import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildMarkArt, CSDTV_CODE, type LogoRow, type MarkArt } from '@/lib/graphics/marks'

export const LOGO_BUCKET = 'school-logos'

/**
 * Real logo art for the schools a show references, plus CSDtv's own.
 *
 * The bucket is public, which is what lets an OBS browser source with no
 * session render a mark at all.
 */
export async function loadMarkArt(
  service: SupabaseClient,
  codes: (string | null | undefined)[],
): Promise<Record<string, MarkArt>> {
  const wanted = [...new Set([CSDTV_CODE, ...codes.filter((c): c is string => Boolean(c))])]
  if (wanted.length === 0) return {}

  const { data } = await service
    .from('school_logos')
    .select('school_code, category, name, format, storage_path, sort_order, is_cover, flagged_for_deletion')
    .in('school_code', wanted)
    .order('sort_order', { ascending: true })

  const rows = ((data || []) as LogoRow[]).filter(r => !r.flagged_for_deletion)
  return buildMarkArt(rows, path => service.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl)
}
