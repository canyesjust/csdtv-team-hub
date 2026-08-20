/**
 * Picking the right logo file for a graphic.
 *
 * `school_logos` holds every mark a school has, in every category and format,
 * catalogued for the brand library. On air we need exactly one, chosen by what
 * the graphic is asking for, and we need it to be the same one every time so a
 * package looks like a package.
 *
 * Pure, so the ranking is testable without a database or a network.
 */

export type LogoRow = {
  school_code: string
  category: string | null
  name: string | null
  format: string | null
  storage_path: string
  sort_order: number | null
  is_cover: boolean | null
  flagged_for_deletion: boolean | null
}

/** What a template is asking for, not what the file happens to be called. */
export type MarkIntent = 'badge' | 'wordmark'

/** Formats a browser can composite over video. EPS and DOCX are print assets. */
const USABLE_FORMATS = ['svg', 'png', 'jpg', 'jpeg', 'webp']

/**
 * PNG and SVG carry transparency, which is the whole game over a camera. A JPG
 * brings a white box with it, so it is a last resort rather than a preference.
 */
function formatScore(format: string | null): number {
  switch ((format || '').toLowerCase()) {
    case 'svg': return 40
    case 'png': return 30
    case 'webp': return 20
    case 'jpg':
    case 'jpeg': return 5
    default: return -1
  }
}

function categoryScore(category: string | null, intent: MarkIntent): number {
  const c = (category || '').toLowerCase()
  if (intent === 'wordmark') {
    if (c === 'wordmark') return 40
    if (c === 'official') return 25
    if (c === 'mascot') return 10
    return 5
  }
  // A badge wants the crest or the mascot head, something that reads square.
  if (c === 'official') return 40
  if (c === 'mascot') return 30
  if (c === 'wordmark') return 12
  if (c === 'team/sport') return 20
  if (c === 'specific') return 8
  return 5
}

/**
 * A white or reversed variant is what you want over a dark panel, and every
 * panel we draw is dark. Named by hand in the brand library, so match loosely.
 */
function variantScore(name: string | null): number {
  const n = (name || '').toLowerCase()
  let score = 0
  // Accumulated, not first-match: "FullColor White Print" is both a white
  // variant and a print asset, and the print part has to still count against it.
  if (/\b(white|reverse|reversed|knockout|ko)\b/.test(n)) score += 12
  if (/\b(black|1color|one ?color|grayscale|greyscale)\b/.test(n)) score -= 6
  if (/\b(print|cmyk)\b/.test(n)) score -= 10
  if (/(\bai\b|doodle|draft|\bold\b|legacy)/.test(n)) score -= 20
  return score
}

export function scoreLogo(row: LogoRow, intent: MarkIntent): number {
  if (row.flagged_for_deletion) return -1
  const fmt = formatScore(row.format)
  if (fmt < 0) return -1
  if (!USABLE_FORMATS.includes((row.format || '').toLowerCase())) return -1
  return (
    categoryScore(row.category, intent) * 10 +
    fmt +
    variantScore(row.name) +
    (row.is_cover ? 15 : 0) +
    Math.max(0, 10 - (row.sort_order ?? 10))
  )
}

/**
 * The single best file for a school and intent, or null when the school has no
 * usable art. Null is a real answer: the caller falls back to the drawn mark
 * rather than showing a broken image on air.
 */
export function pickLogo(rows: LogoRow[], intent: MarkIntent = 'badge'): LogoRow | null {
  let best: LogoRow | null = null
  let bestScore = 0
  for (const row of rows) {
    const score = scoreLogo(row, intent)
    if (score > bestScore) { bestScore = score; best = row }
  }
  return best
}

export type MarkArt = { badge: string | null; wordmark: string | null }

/**
 * One entry per school code, each already a public URL. Built once per show
 * load rather than per graphic, because the output re-renders on every take.
 */
export function buildMarkArt(
  rows: LogoRow[],
  publicUrl: (path: string) => string,
): Record<string, MarkArt> {
  const byCode = new Map<string, LogoRow[]>()
  for (const row of rows) {
    const list = byCode.get(row.school_code)
    if (list) list.push(row)
    else byCode.set(row.school_code, [row])
  }

  const out: Record<string, MarkArt> = {}
  for (const [code, list] of byCode) {
    const badge = pickLogo(list, 'badge')
    const wordmark = pickLogo(list, 'wordmark')
    out[code] = {
      badge: badge ? publicUrl(badge.storage_path) : null,
      wordmark: wordmark ? publicUrl(wordmark.storage_path) : null,
    }
  }
  return out
}

/** CSDtv's own art lives under the studio's department code. */
export const CSDTV_CODE = '099'
export const DISTRICT_CODE = '021'
