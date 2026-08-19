import { relativeLuminance } from '@/lib/graphics/theme'

export type MarkContext = {
  schoolCode: string | null
  awayCode: string | null
  schools: Record<string, { short_name?: string | null; name?: string | null; mascot?: string | null;
    primary_color?: string | null; secondary_color?: string | null; accent_color?: string | null }>
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
 * Placeholder marks until `school_logos` art is wired in. The shape is the
 * point: a mark always sits in its own fixed cell, so a wide wordmark and a
 * square crest both drop in without re-laying-out the graphic.
 */
export default function LogoMark({ code, size, ctx }: { code: string | null; size: number; ctx: MarkContext }) {
  if (!code) return null

  if (code === 'sponsor') {
    return (
      <svg className="gx-mark" width={size} height={size} viewBox="0 0 100 100" aria-hidden>
        <rect x="4" y="22" width="92" height="56" rx="9" fill="#12203a" stroke="rgba(255,255,255,.35)" strokeWidth="2" />
        <text x="50" y="57" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="16" fontWeight="800" fill="#dfe7f5" letterSpacing="1">LOGO</text>
      </svg>
    )
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
