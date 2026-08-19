/**
 * Mapping a production record onto graphics fields. Pure, no server imports, so
 * the guesses are unit-testable against the shapes the district system actually
 * produces.
 */
import type { GraphicsEventType } from '@/lib/graphics/types'

export type ProductionSummary = {
  id: string
  production_number: number | null
  title: string
  status: string | null
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
 * Productions the graphics app has no business offering. Board meetings run on
 * their own system and a photo shoot has no video to put a graphic on.
 */
const EXCLUDED_TYPES = ['board meeting', 'photos']

export function isGraphicsCandidate(production: ProductionSummary): boolean {
  const label = (production.internal_type_label || '').toLowerCase().trim()
  return !EXCLUDED_TYPES.includes(label)
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
  if (/\b(concert|choir|choral|band|orchestra|recital|symphony|jazz|musical|showcase)\b/.test(haystack)) return 'concert'
  if (/\b(game|football|basketball|volleyball|soccer|baseball|softball|wrestling|lacrosse|tennis|hockey|match|tournament)\b/.test(haystack)) return 'game'
  return 'other'
}

/**
 * The district writes school as a numeric location code, not a name, and drops
 * the leading zero as often as not. `schools.code` is the same code padded to
 * three, so normalise and compare rather than matching on names.
 */
export function normalizeSchoolCode(raw: string | null | undefined): string | null {
  const value = String(raw ?? '').trim()
  if (!value || !/^\d{1,4}$/.test(value)) return null
  return value.length >= 3 ? value.replace(/^0+(?=\d{3})/, '') : value.padStart(3, '0')
}

/**
 * Where it is being shot beats who asked for it. A Draper Park concert
 * requested by the district office is still a Draper Park show.
 */
export function guessSchoolCode(
  production: ProductionSummary,
  schools: { code: string; name: string | null; short_name: string | null }[],
): string | null {
  const known = new Set(schools.map(s => s.code))
  for (const raw of [production.filming_location, production.school_department]) {
    const code = normalizeSchoolCode(raw)
    if (code && known.has(code)) return code
  }

  // Fall back to a loose name match, for the rare record that carries text.
  const dept = (production.school_department || '').toLowerCase().trim()
  if (!dept) return null
  for (const school of schools) {
    for (const candidate of [school.short_name, school.name]) {
      const value = (candidate || '').toLowerCase().trim()
      if (value.length > 2 && dept.includes(value)) return school.code
    }
  }
  return null
}

/**
 * Venue, preferring what a human typed. All three location fields can hold a
 * numeric school code instead of a name, so a code is only useful once it has
 * been resolved against the schools table.
 */
export function guessVenue(
  production: ProductionSummary,
  schools: { code: string; name: string | null; short_name: string | null }[] = [],
): string | null {
  const candidates = [production.event_location, production.location, production.filming_location]

  for (const raw of candidates) {
    const value = (raw || '').trim()
    if (value && !normalizeSchoolCode(value)) return value
  }
  for (const raw of candidates) {
    const code = normalizeSchoolCode(raw)
    const school = code ? schools.find(s => s.code === code) : null
    if (school) return school.name || school.short_name || null
  }
  return null
}

/** The moment the show starts. `event_date` is empty on every record we have. */
export function productionDate(production: ProductionSummary): string | null {
  if (production.start_datetime) return production.start_datetime
  return production.event_date ? `${production.event_date}T12:00:00.000Z` : null
}
