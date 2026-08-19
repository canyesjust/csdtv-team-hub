import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { GraphicsEventType } from '@/lib/graphics/types'

export type ProductionSummary = {
  id: string
  production_number: number | null
  title: string
  event_date: string | null
  start_datetime: string | null
  end_datetime: string | null
  location: string | null
  event_location: string | null
  filming_location: string | null
  school_department: string | null
  internal_type_label: string | null
  video_shoot_type: string | null
}

/**
 * Guess the event type from what the requester already told us. It is only a
 * default: the picker is right there and the operator can override it.
 */
export function guessEventType(production: ProductionSummary): GraphicsEventType {
  const haystack = [
    production.title, production.video_shoot_type, production.internal_type_label,
  ].filter(Boolean).join(' ').toLowerCase()

  if (/\b(graduation|commencement|senior night|awards?|recognition|ceremony)\b/.test(haystack)) return 'ceremony'
  if (/\b(parade)\b/.test(haystack)) return 'parade'
  if (/\b(concert|choir|choral|band|orchestra|recital|symphony|jazz|musical)\b/.test(haystack)) return 'concert'
  if (/\b(game|football|basketball|volleyball|soccer|baseball|softball|wrestling|lacrosse|tennis|hockey|match|tournament)\b/.test(haystack)) return 'game'
  return 'other'
}

/**
 * Best guess at the school from the requesting department. Matched loosely
 * because `school_department` is free text out of the district system.
 */
export function guessSchoolCode(
  production: ProductionSummary,
  schools: { code: string; name: string | null; short_name: string | null }[],
): string | null {
  const dept = (production.school_department || '').toLowerCase().trim()
  if (!dept) return null
  for (const school of schools) {
    for (const candidate of [school.short_name, school.name, school.code]) {
      const value = (candidate || '').toLowerCase().trim()
      if (value.length > 2 && dept.includes(value)) return school.code
    }
  }
  return null
}

/** Venue, preferring the most specific field the requester filled in. */
export function guessVenue(production: ProductionSummary): string | null {
  return production.filming_location || production.event_location || production.location || null
}

export async function listProductionsForGraphics(
  service: SupabaseClient,
  limit = 60,
): Promise<ProductionSummary[]> {
  const since = new Date(Date.now() - 14 * 24 * 3600_000).toISOString().slice(0, 10)
  const { data } = await service
    .from('productions')
    .select(
      'id, production_number, title, event_date, start_datetime, end_datetime, location, event_location, filming_location, school_department, internal_type_label, video_shoot_type',
    )
    .gte('event_date', since)
    .order('event_date', { ascending: true })
    .limit(limit)
  return (data || []) as ProductionSummary[]
}
