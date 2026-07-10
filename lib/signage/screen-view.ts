// Shared constants + helpers behind the two signage screen renderers:
//   - app/signage/screen/[code]/ScreenClient.tsx  (live React page)
//   - lib/signage/build-screen-html.ts            (baked static HTML for AbleSign)
//
// Both renderers must emit byte-identical weather icons, colors, timings, and QR
// image, so these previously-duplicated pieces live here to stop the two copies
// from drifting. Behavior here is intentionally identical to the former inline
// definitions in each renderer.

// Slide crossfade + wayfinding heading rotation timings (ms).
export const SCREEN_CROSSFADE_MS = 700
export const SCREEN_HEADING_ROTATE_MS = 3500

// CSDtv news QR (canyonsdistrict.org/news), inlined so the AbleSign HTML has no
// external image dependency. Byte-identical copy shared by both renderers.
export const SCREEN_NEWS_QR =
  'data:image/png;base64,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'

/**
 * Current hour (0-23) in America/Denver.
 *
 * The server HTML builder and the live client must agree on day/night, so both
 * derive the weather icon from this single Denver-zoned hour helper.
 */
export function denverHour(): number {
  try {
    const s = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Denver',
      hour: 'numeric',
      hour12: false,
    }).format(new Date())
    const n = parseInt(s, 10)
    return Number.isFinite(n) ? n % 24 : new Date().getHours()
  } catch {
    return new Date().getHours()
  }
}

/** Map a weather condition string to the CSS weather-scene class. */
export function screenWeatherClass(condition: string): string {
  const t = (condition || '').toLowerCase()
  if (/thunder|storm|t-storm/.test(t)) return 'storm'
  if (/snow|sleet|blizzard|flurr|wintry/.test(t)) return 'snow'
  if (/rain|shower|drizzle/.test(t)) return 'rain'
  if (/cloud|overcast/.test(t)) return 'cloudy'
  const h = denverHour()
  if (h < 6 || h >= 20) return 'night'
  return 'sunny'
}

// Per-site brand colors → CSS variables. Light brand backgrounds are auto-
// darkened so white signage text stays legible.
export function ensureDarkBg(hex: string): string {
  const m = hex.replace('#', '')
  const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m
  if (full.length !== 6) return hex
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 110 ? `color-mix(in srgb, ${hex} 52%, #0a0a0a)` : hex
}

export type ScreenColorVars = { bg: string; panel: string | null; accent: string | null }

/**
 * Ordered CSS custom-property [name, value] pairs for a site's brand colors.
 *
 * This is the shared computation behind ScreenClient's `siteColorVars` (which
 * wraps it into a React CSSProperties object) and build-screen-html's
 * `siteStyleAttr` (which wraps it into an inline style="" attribute string).
 * Returns [] when there is no usable background color, so both wrappers can
 * reproduce their original "nothing to emit" behavior.
 */
export function screenColorVarPairs(colors: ScreenColorVars | null): Array<[string, string]> {
  if (!colors?.bg) return []
  const bg = ensureDarkBg(colors.bg)
  const pairs: Array<[string, string]> = [
    ['--navy', bg],
    ['--panel', colors.panel || `color-mix(in srgb, ${bg} 78%, #ffffff)`],
  ]
  if (colors.accent) pairs.push(['--accent', colors.accent])
  return pairs
}
