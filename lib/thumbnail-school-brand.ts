/** Resolve `school_brand_colors` rows for thumbnail prompts despite label drift (Mt. vs Mount, short vs full names). */

export type ThumbnailBrandColorRow = {
  school_code: string | null
  school_name: string | null
  primary_color: string | null
  secondary_color: string | null
  accent_color: string | null
  mascot: string | null
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

/** Every token from the shorter label appears in the longer token list (substring ok). */
function tokensSubsetMatch(a: string, b: string): boolean {
  const ta = significantTokens(a)
  const tb = significantTokens(b)
  if (ta.length === 0 || tb.length === 0) return false
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  return short.every(t => long.some(l => l === t || l.includes(t) || t.includes(l)))
}

function findByFuzzyNames(rows: ThumbnailBrandColorRow[], names: string[]): ThumbnailBrandColorRow | undefined {
  const cleaned = names.map(n => n.trim()).filter(Boolean)
  for (const row of rows) {
    const rn = (row.school_name || '').trim()
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

/**
 * Match a `school_brand_colors` row for thumbnail BRAND COLORS.
 * @param thumbSchoolCode — `schools.code`, `"district"`, or dropdown value (`school_code` or `school_name` from brand table)
 * @param overrideName — "School override" field (often from `getSchoolName` / short labels)
 * @param catalogName — Full name from `schools` row when known
 */
export function findMatchingSchoolBrandColorRow(
  rows: ThumbnailBrandColorRow[],
  opts: { thumbSchoolCode: string; overrideName: string; catalogName: string | null },
): ThumbnailBrandColorRow | undefined {
  const tc = (opts.thumbSchoolCode || '').trim()
  const override = (opts.overrideName || '').trim()
  const catalog = (opts.catalogName || '').trim()

  if (tc && tc !== 'district') {
    const byRowCode = rows.find(r => r.school_code && normCode(r.school_code) === normCode(tc))
    if (byRowCode) return byRowCode
    const byValueAsName = rows.find(r => (r.school_name || '').trim() === tc)
    if (byValueAsName) return byValueAsName
  }

  return findByFuzzyNames(rows, [override, catalog])
}
