import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Brand color palettes: each school has one or more named palettes (default
 * "Primary"), each with up to 8 colors. Slots that are not set are `null` and
 * are not rendered as swatches.
 *
 * The "Primary" palette's first four slots are kept in sync with the legacy
 * schools.primary_color/secondary_color/accent_color/text_color columns, which
 * signage sites, admin settings, and the productions page read directly. Sync
 * runs both ways so editing colors from either surface keeps the other current.
 */

export const PALETTE_COLOR_SLOTS = 8

export type Palette = {
  id: string
  schoolCode: string
  name: string
  sortOrder: number
  colors: (string | null)[]
}

type PaletteRow = {
  id: string
  school_code: string
  name: string
  sort_order: number
  colors: (string | null)[] | null
}

function toPalette(row: PaletteRow): Palette {
  const colors = Array.isArray(row.colors) ? row.colors.slice(0, PALETTE_COLOR_SLOTS) : []
  while (colors.length < PALETTE_COLOR_SLOTS) colors.push(null)
  return { id: row.id, schoolCode: row.school_code, name: row.name, sortOrder: row.sort_order, colors }
}

/** undefined = invalid input (caller should reject); otherwise a normalized 8-slot array. */
export function normalizePaletteColors(input: unknown): (string | null)[] | undefined {
  if (!Array.isArray(input)) return undefined
  if (input.length > PALETTE_COLOR_SLOTS) return undefined
  const out: (string | null)[] = new Array(PALETTE_COLOR_SLOTS).fill(null)
  for (let i = 0; i < input.length; i++) {
    const raw = input[i]
    const t = String(raw ?? '').trim()
    if (!t) { out[i] = null; continue }
    const h = t.startsWith('#') ? t : `#${t}`
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h)) return undefined
    out[i] = h.toLowerCase()
  }
  return out
}

export async function listPalettes(service: SupabaseClient, code: string): Promise<Palette[]> {
  const { data } = await service
    .from('school_brand_palettes')
    .select('id, school_code, name, sort_order, colors')
    .eq('school_code', code)
    .order('sort_order', { ascending: true })
  return ((data ?? []) as PaletteRow[]).map(toPalette)
}

/**
 * Idempotently ensure a school has a "Primary" palette, seeding it from the
 * legacy 4 color columns the first time. Safe to call on every read so schools
 * created after this migration (or never explicitly given a palette) still have
 * one to show/edit.
 */
export async function ensurePrimaryPalette(service: SupabaseClient, code: string): Promise<void> {
  const { data: existing } = await service
    .from('school_brand_palettes')
    .select('id')
    .eq('school_code', code)
    .ilike('name', 'primary')
    .maybeSingle()
  if (existing) return

  const { data: school } = await service
    .from('schools')
    .select('primary_color, secondary_color, accent_color, text_color')
    .eq('code', code)
    .maybeSingle()

  const colors: (string | null)[] = [
    school?.primary_color ?? null,
    school?.secondary_color ?? null,
    school?.accent_color ?? null,
    school?.text_color ?? null,
    null, null, null, null,
  ]
  // Idempotent under a race: the (school_code, name) unique constraint rejects a
  // duplicate insert if another request created it first; that's fine, ignore the error.
  await service.from('school_brand_palettes').insert({ school_code: code, name: 'Primary', sort_order: 0, colors })
}

/** Write the Primary palette's first 4 slots into the legacy schools color columns. */
export async function syncSchoolColumnsFromPrimaryPalette(
  service: SupabaseClient,
  code: string,
  colors: (string | null)[],
): Promise<void> {
  await service
    .from('schools')
    .update({
      primary_color: colors[0] ?? null,
      secondary_color: colors[1] ?? null,
      accent_color: colors[2] ?? null,
      text_color: colors[3] ?? null,
    })
    .eq('code', code)
}

/** Write the legacy schools color columns into the Primary palette's first 4 slots. */
export async function syncPrimaryPaletteFromSchoolColumns(
  service: SupabaseClient,
  code: string,
  colors: { primary_color?: string | null; secondary_color?: string | null; accent_color?: string | null; text_color?: string | null },
): Promise<void> {
  const nextFour: (string | null)[] = [
    colors.primary_color ?? null,
    colors.secondary_color ?? null,
    colors.accent_color ?? null,
    colors.text_color ?? null,
  ]

  const { data: existing } = await service
    .from('school_brand_palettes')
    .select('id, colors')
    .eq('school_code', code)
    .ilike('name', 'primary')
    .maybeSingle()

  if (existing) {
    const rest = (Array.isArray(existing.colors) ? existing.colors : []).slice(4, 8)
    while (rest.length < 4) rest.push(null)
    await service
      .from('school_brand_palettes')
      .update({ colors: [...nextFour, ...rest], updated_at: new Date().toISOString() })
      .eq('id', existing.id)
  } else {
    await service
      .from('school_brand_palettes')
      .insert({ school_code: code, name: 'Primary', sort_order: 0, colors: [...nextFour, null, null, null, null] })
  }
}
