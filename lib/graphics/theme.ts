import type { GraphicsTheme } from '@/lib/graphics/types'

/**
 * School brand colours are not on-air colours. Corner Canyon's primary is a
 * near-black navy and Alta's is literally black, so feeding `schools` straight
 * into a graphic gives you an invisible accent on a dark panel.
 *
 * Derivation: take the most chromatic colour for the leading bar and raise its
 * HSL lightness until it clears a luminance floor (lightness, not a mix toward
 * white, because mixing desaturates a navy into slate). Take the next distinct
 * colour for the trailing bar, the lightest for accent text, and sink the
 * darkest hard toward black for the panel base.
 *
 * `graphics_theme_overrides` holds the handful where this is wrong.
 */

const DEFAULT_THEME: GraphicsTheme = { g1: '#c2283a', g2: '#234fb0', g3: '#f0cd7a', panel: '#0a1020' }

export function hexToRgb(hex: string): [number, number, number] {
  let h = String(hex || '#000').replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  if (Number.isNaN(n)) return [0, 0, 0]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(rgb: number[]): string {
  return '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function chroma(hex: string): number {
  const c = hexToRgb(hex)
  return Math.max(...c) - Math.min(...c)
}

function mix(hex: string, target: string, amount: number): string {
  const a = hexToRgb(hex)
  const b = hexToRgb(target)
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * amount))
}

function tooClose(a: string, b: string): boolean {
  const x = hexToRgb(a)
  const y = hexToRgb(b)
  return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) < 95
}

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255)
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  let h = 0
  let s = 0
  if (mx !== mn) {
    const d = mx - mn
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
    h /= 6
  }
  return [h, s, l]
}

function fromHsl(h: number, s: number, l: number): string {
  const f = (p: number, q: number, t: number) => {
    let x = t
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  if (s === 0) return rgbToHex([l * 255, l * 255, l * 255])
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return rgbToHex([f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255])
}

function liftToLuminance(hex: string, floor: number): string {
  const [h, s] = toHsl(hex)
  let [, , l] = toHsl(hex)
  let out = hex
  let guard = 0
  while (relativeLuminance(out) < floor && l < 0.72 && guard < 40) {
    l += 0.03
    out = fromHsl(h, s, l)
    guard++
  }
  return out
}

function clampLuminance(hex: string, lo: number, hi: number): string {
  const [h, s] = toHsl(hex)
  let [, , l] = toHsl(hex)
  let out = hex
  let guard = 0
  while (relativeLuminance(out) < lo && l < 0.72 && guard < 40) {
    l += 0.03
    out = fromHsl(h, s, l)
    guard++
  }
  guard = 0
  while (relativeLuminance(out) > hi && l > 0.12 && guard < 40) {
    l -= 0.03
    out = fromHsl(h, s, l)
    guard++
  }
  return out
}

export type SchoolColors = {
  primary_color?: string | null
  secondary_color?: string | null
  accent_color?: string | null
}

export function deriveTheme(school: SchoolColors | null | undefined): GraphicsTheme {
  const cols = [school?.primary_color, school?.secondary_color, school?.accent_color]
    .filter((c): c is string => typeof c === 'string' && /^#?[0-9a-f]{3,8}$/i.test(c.trim()))
    .map(c => (c.startsWith('#') ? c : `#${c}`))
  if (cols.length === 0) return { ...DEFAULT_THEME }

  const byLum = [...cols].sort((a, b) => relativeLuminance(a) - relativeLuminance(b))
  const byChroma = [...cols].sort((a, b) => chroma(b) - chroma(a))

  const panel = mix(byLum[0], '#000000', 0.84)
  const g1 = liftToLuminance(byChroma[0], 0.13)

  let g2: string | null = null
  const rest = cols
    .filter(c => c !== byChroma[0])
    .sort((a, b) => chroma(b) - chroma(a) || relativeLuminance(a) - relativeLuminance(b))
  for (const c of rest) {
    const candidate = clampLuminance(c, 0.09, 0.55)
    if (!tooClose(g1, candidate)) {
      g2 = candidate
      break
    }
  }
  if (!g2) {
    const [h, s, l] = toHsl(g1)
    g2 = fromHsl((h + 0.5) % 1, Math.max(s * 0.7, 0.25), Math.max(l - 0.18, 0.16))
  }

  let g3 = liftToLuminance(byLum[byLum.length - 1], 0.55)
  // A pure white accent leaves no hierarchy against white body text, so warm it.
  if (chroma(g3) < 16 && relativeLuminance(g3) > 0.8) g3 = mix(g3, '#f0cd7a', 0.28)

  return { g1, g2, g3, panel }
}

/** CSS custom properties the renderer reads. */
export function themeCssVars(theme: GraphicsTheme): Record<string, string> {
  const [r, g, b] = hexToRgb(theme.panel)
  return {
    '--gx-1': theme.g1,
    '--gx-2': theme.g2,
    '--gx-3': theme.g3,
    '--gx-panel': theme.panel,
    '--gx-glass': `rgba(${r}, ${g}, ${b}, 0.94)`,
  }
}
