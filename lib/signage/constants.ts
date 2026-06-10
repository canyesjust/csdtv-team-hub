/** CIC signage brand colors — six-color palette only. */
export const CIC_PALETTE = {
  navy: '#162844',
  panel: '#1e3649',
  gray: '#585555',
  accent: '#96b7c8',
  white: '#fefefe',
  black: '#000000',
} as const

export const SIGNAGE_MEDIA_BUCKET = 'signage-media'

/** CIC is in Utah — feed date windows use this zone, not UTC. */
export const SIGNAGE_TIMEZONE = 'America/Denver'

export function signageTodayDateString(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: SIGNAGE_TIMEZONE })
}

/** Wall clock for CIC screens — always Mountain Time, not the TV device timezone. */
export function formatSignageClock(now = new Date()): string {
  return now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: SIGNAGE_TIMEZONE,
  })
}

export const CIC_REVIEW_URL = 'https://www.csdtvstaff.org/dashboard/signage/content'
export const CIC_SUBMIT_URL = 'https://www.csdtvstaff.org/signage/submit'

export function signageScreenUrl(code: string): string {
  const base = typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.csdtvstaff.org')
  return `${base.replace(/\/$/, '')}/signage/screen/${encodeURIComponent(code)}`
}

export function signageMediaPublicUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? ''
  return `${base}/storage/v1/object/public/${SIGNAGE_MEDIA_BUCKET}/${path}`
}

export type SignageOrientation = 'landscape' | 'portrait'
export type SignageLayout = 'full_bleed' | 'zoned' | 'wayfinding'
export type WayfindingDirection = 'left' | 'right' | 'up' | 'down' | 'straight'

export const WAYFINDING_ARROWS: Record<WayfindingDirection, string> = {
  left: '←',
  right: '→',
  up: '↑',
  down: '↓',
  straight: '↑',
}
