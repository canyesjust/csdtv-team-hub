/** Thumbnail helpers: resolve `schools` rows from the picker (exact only) and map hex columns for prompts. */

export type ThumbnailSchoolRow = {
  id?: string
  code: string | null
  name: string | null
  short_name?: string | null
  primary_color?: string | null
  secondary_color?: string | null
  accent_color?: string | null
  text_color?: string | null
  link_url?: string | null
  city?: string | null
  mascot?: string | null
  active?: boolean | null
  type?: string | null
}

function pickHex(v: string | null | undefined): string | null {
  const raw = (v || '').trim()
  if (!raw) return null
  const t = raw.startsWith('#') ? raw : `#${raw}`
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) return t
  return null
}

/** Last resort when a school row has no parseable colors — not Canyons district branding. */
export const NEUTRAL_BRAND_HEX = { primary: '#334155', secondary: '#64748b', accent: '#ffffff' } as const

/**
 * Map school color columns to three BRAND COLORS slots for the thumbnail prompt.
 * When `primary_color` is null, promotes secondary → primary so the model does not get Canyons defaults by accident.
 */
export function promptBrandHexesFromRow(row: {
  primary_color?: string | null
  secondary_color?: string | null
  accent_color?: string | null
  text_color?: string | null
}): { primary: string; secondary: string; accent: string } {
  const p = pickHex(row.primary_color)
  const s = pickHex(row.secondary_color)
  const a = pickHex(row.accent_color)
  const txt = pickHex(row.text_color)

  if (p && s && a) return { primary: p, secondary: s, accent: a }
  if (p && s) return { primary: p, secondary: s, accent: a || '#ffffff' }
  if (p) return { primary: p, secondary: s || '#64748b', accent: a || '#ffffff' }

  if (!p && s && a) return { primary: s, secondary: a, accent: txt || '#ffffff' }
  if (!p && s && txt) return { primary: s, secondary: txt, accent: a || '#ffffff' }
  if (!p && s) return { primary: s, secondary: '#334155', accent: '#ffffff' }

  return { ...NEUTRAL_BRAND_HEX }
}

function isUuidLike(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim())
}

function normCode(c: string | null | undefined): string {
  if (c === null || c === undefined) return ''
  const t = String(c).trim()
  if (!t) return ''
  return t.replace(/^0+/, '') || '0'
}

function activeSchools(rows: ThumbnailSchoolRow[]): ThumbnailSchoolRow[] {
  return rows.filter(r => r.active !== false)
}

/**
 * Exact match only: `schools.id` (UUID), then `schools.code` (leading-zero insensitive), then `schools.name` (trimmed, case-insensitive).
 * "School override" does not pick a different row for colors — only this picker value does.
 */
export function resolveSchoolFromPicker(rows: ThumbnailSchoolRow[], value: string): ThumbnailSchoolRow | undefined {
  const v = (value || '').trim()
  if (!v || v.toLowerCase() === 'district') return undefined
  const pool = activeSchools(rows)
  if (isUuidLike(v)) {
    const byId = pool.find(r => r.id && String(r.id).trim() === v)
    if (byId) return byId
  }
  const byCode = pool.find(r => r.code && normCode(r.code) === normCode(v))
  if (byCode) return byCode
  const vl = v.toLowerCase()
  return pool.find(r => (r.name || '').trim().toLowerCase() === vl)
}
