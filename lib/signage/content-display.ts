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
