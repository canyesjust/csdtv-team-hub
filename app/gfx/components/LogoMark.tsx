import { relativeLuminance } from '@/lib/graphics/theme'
import { CSDTV_CODE } from '@/lib/graphics/marks'

export type MarkContext = {
  schoolCode: string | null
  awayCode: string | null
  schools: Record<string, { short_name?: string | null; name?: string | null; mascot?: string | null;
    primary_color?: string | null; secondary_color?: string | null; accent_color?: string | null }>
  /** Real logo files by school code. Absent means fall back to the drawn mark. */
  marks?: Record<string, { badge: string | null; wordmark: string | null }>
  /** Sponsor art on the show, keyed by sponsor name. */
  sponsorMarks?: Record<string, string | null>
  /** The sponsor a graphic is currently naming, so the bug can find its logo. */
  sponsorName?: string | null
}

/** Resolves a template's logo field to a concrete mark. */
export function resolveMarkCode(value: string | undefined, ctx: MarkContext): string | null {
  if (!value || value === 'none') return null
  if (value === 'district') return 'csdtv'
  if (value === 'sponsor') return 'sponsor'
  if (value === 'school') return ctx.schoolCode
  if (value === 'away') return ctx.awayCode
  return value
}

/**
 * A mark always sits in its own fixed cell, so a wide wordmark and a square
 * crest both drop in without re-laying-out the graphic.
 *
 * Real art out of `school_logos` when the school has usable art, and the drawn
 * crest when it does not. The fallback matters: a school with only print files
 * still gets something on air in its own colours rather than a broken image.
 */
export default function LogoMark({
  code, size, ctx, intent = 'badge',
}: {
  code: string | null
  size: number
  ctx: MarkContext
  intent?: 'badge' | 'wordmark'
}) {
  if (!code) return null

  if (code === 'sponsor') {
    const art = ctx.sponsorName ? ctx.sponsorMarks?.[ctx.sponsorName] : null
    if (art) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img className="gx-mark gx-art" src={art} alt="" width={size} height={size} />
    }
    return (
      <svg className="gx-mark" width={size} height={size} viewBox="0 0 100 100" aria-hidden>
        <rect x="4" y="22" width="92" height="56" rx="9" fill="#12203a" stroke="rgba(255,255,255,.35)" strokeWidth="2" />
        <text x="50" y="57" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="16" fontWeight="800" fill="#dfe7f5" letterSpacing="1">LOGO</text>
      </svg>
    )
  }
  const art = ctx.marks?.[code === 'csdtv' ? CSDTV_CODE : code]
  const file = intent === 'wordmark' ? (art?.wordmark ?? art?.badge) : (art?.badge ?? art?.wordmark)
  if (file) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="gx-mark gx-art" src={file} alt="" width={size} height={size} />
  }

  if (code === 'csdtv') {
    return (
      <svg className="gx-mark" width={size} height={size} viewBox="0 0 100 100" aria-hidden>
        <rect x="6" y="6" width="88" height="88" rx="20" fill="#0a2c52" stroke="#1c6aa8" strokeWidth="3" />
        <path d="M40 32 L70 50 L40 68 Z" fill="#fbae42" />
        <text x="50" y="86" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="12" fontWeight="800" fill="#dbe6f7" letterSpacing="2">CSDTV</text>
      </svg>
    )
  }

  const school = ctx.schools[code]
  const primary = school?.primary_color || '#0a2c52'
  const accent = school?.accent_color || '#ffffff'
  const secondary = school?.secondary_color || '#ffffff'
  const ring = relativeLuminance(accent) > relativeLuminance(primary) ? accent : secondary
  const label = school?.short_name || school?.name || code
  const initials = label.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <svg className="gx-mark" width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <path d="M50 5 L90 20 V52 C90 74 72 88 50 96 C28 88 10 74 10 52 V20 Z" fill={primary} stroke={ring} strokeWidth="4" />
      <text x="50" y="56" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="34" fontWeight="900"
        fill={relativeLuminance(primary) < 0.3 ? '#ffffff' : '#101010'}>{initials}</text>
      <text x="50" y="76" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="700"
        fill={ring} letterSpacing="1">{(school?.mascot || '').toUpperCase().slice(0, 9)}</text>
    </svg>
  )
}
