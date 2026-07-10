export const SIGNAGE_DEFAULT_DISPLAY_SECONDS = 10
export const SIGNAGE_MIN_DISPLAY_SECONDS = 3
export const SIGNAGE_MAX_DISPLAY_SECONDS = 300

export type SignageContentType = 'image' | 'video' | 'html'

export function clampDisplaySeconds(value: unknown): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10)
  if (Number.isNaN(n)) return SIGNAGE_DEFAULT_DISPLAY_SECONDS
  return Math.min(SIGNAGE_MAX_DISPLAY_SECONDS, Math.max(SIGNAGE_MIN_DISPLAY_SECONDS, n))
}

/** Strip script tags from manager-authored HTML slides. */
export function sanitizeSignageHtml(html: string): string {
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
}

/** Allowed logical render widths (px) for a website slide's "page zoom". */
export const WEBSITE_WIDTH_PRESETS = [1920, 2560, 3200] as const

/**
 * Read a website slide's logical render width from its gen_meta. `null` means
 * render at the zone's native size (fill, no scaling — best for pages already
 * built for a TV). A number means render the page that many CSS px wide and
 * scale it to fit the zone, so a tall site shows more of the page.
 */
export function websiteWidthFromMeta(meta: unknown): number | null {
  if (!meta || typeof meta !== 'object') return null
  const raw = (meta as Record<string, unknown>).website_width
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(n) || n <= 0) return null
  // Bound to a sane range so a bad value can't blow up the layout.
  return Math.min(6000, Math.max(640, Math.round(n)))
}
