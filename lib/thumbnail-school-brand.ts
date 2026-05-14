/** Thumbnail helpers: match `schools` rows by code/name (handles Mt. vs Mount, etc.) and map hex columns for prompts. */

export type ThumbnailSchoolRow = {
  id?: string
  code: string | null
  name: string | null
  primary_color?: string | null
  secondary_color?: string | null
  accent_color?: string | null
  text_color?: string | null
  mascot?: string | null
  active?: boolean | null
}

function pickHex(v: string | null | undefined): string | null {
  const t = (v || '').trim()
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t) ? t : null
}

const DISTRICT_BRAND_HEX = { primary: '#003087', secondary: '#e8a020', accent: '#ffffff' } as const

/**
 * Map school color columns to three BRAND COLORS slots for the thumbnail prompt.
 * When `primary_color` is null (common), promotes secondary → primary so the model
 * does not receive Canyons defaults by accident.
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

  return { ...DISTRICT_BRAND_HEX }
}

function normCode(c: string | null | undefined): string {
  if (c === null || c === undefined) return ''
  const t = String(c).trim()
  if (!t) return ''
  return t.replace(/^0+/, '') || '0'
}

/** Lowercase, unify Mt/Mount, collapse punctuation for fuzzy compare. */
export function normalizeSchoolMatchString(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[.'"]/g, '')
    .replace(/\b(mt\.?|mount)\b/gi, 'mount')
    .replace(/\b(st\.?|saint)\b/gi, 'saint')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const TOKEN_STOP = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'at', 'in', 'for', 'to'])

function significantTokens(s: string): string[] {
  return normalizeSchoolMatchString(s)
    .split(' ')
    .filter(t => t.length > 1 && !TOKEN_STOP.has(t))
}

function tokensSubsetMatch(a: string, b: string): boolean {
  const ta = significantTokens(a)
  const tb = significantTokens(b)
  if (ta.length === 0 || tb.length === 0) return false
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  return short.every(t => long.some(l => l === t || l.includes(t) || t.includes(l)))
}

function findByFuzzyNames(rows: ThumbnailSchoolRow[], names: string[]): ThumbnailSchoolRow | undefined {
  const cleaned = names.map(n => n.trim()).filter(Boolean)
  for (const row of rows) {
    const rn = (row.name || '').trim()
    if (!rn) continue
    for (const name of cleaned) {
      if (!name) continue
      if (rn.toLowerCase() === name.toLowerCase()) return row
      const nr = normalizeSchoolMatchString(rn)
      const nn = normalizeSchoolMatchString(name)
      if (!nn) continue
      if (nr === nn || nr.includes(nn) || nn.includes(nr)) return row
      if (tokensSubsetMatch(rn, name)) return row
    }
  }
  return undefined
}

function activeSchools(rows: ThumbnailSchoolRow[]): ThumbnailSchoolRow[] {
  return rows.filter(r => r.active !== false)
}

/**
 * Match a `schools` row for thumbnail BRAND COLORS / mascot.
 * @param thumbSchoolCode — `schools.code`, `"district"`, or dropdown value (code or full name)
 * @param overrideName — "School override" field (often from `getSchoolName` / short labels)
 * @param catalogName — Full name from the selected school row when known
 */
export function findMatchingSchoolForThumbnail(
  rows: ThumbnailSchoolRow[],
  opts: { thumbSchoolCode: string; overrideName: string; catalogName: string | null },
): ThumbnailSchoolRow | undefined {
  const pool = activeSchools(rows)
  const tc = (opts.thumbSchoolCode || '').trim()
  const override = (opts.overrideName || '').trim()
  const catalog = (opts.catalogName || '').trim()

  if (tc && tc !== 'district') {
    const byRowCode = pool.find(r => r.code && normCode(r.code) === normCode(tc))
    if (byRowCode) return byRowCode
    const byValueAsName = pool.find(r => (r.name || '').trim() === tc)
    if (byValueAsName) return byValueAsName
  }

  return findByFuzzyNames(pool, [override, catalog])
}
