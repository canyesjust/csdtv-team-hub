import type { SignageLayout, SignageOrientation, SignageTheme } from './constants'
import type { SignageWeather } from './weather'

export type ScreenFeedMedia = {
  id: string
  // 'website' = live external page shown in a direct iframe at the zone's native
  // size (for TV-mode dashboards); 'html' = a self-contained slide document.
  type: 'image' | 'video' | 'html' | 'website'
  title: string | null
  url: string
  html: string | null
  full_screen: boolean
  display_seconds: number
  // Website slides only. When set, the live page is rendered at this logical CSS
  // width and scaled to fit the zone — so a tall site (whose full-width layout
  // would otherwise be clipped below the fold) shows much more of the page. When
  // null/undefined the page renders at the zone's native size (best for pages
  // already designed for a TV, e.g. kiosk/TV-mode dashboards).
  website_width?: number | null
}

export type ScreenFeedAnnouncement = {
  id: string
  title: string
  subtitle: string | null
  in_ticker: boolean
  icon: string
  scope_label: string | null
  all_screens: boolean
}

export type ScreenFeedWayfinding = {
  id: string
  destination: string
  direction: string
}

export type ScreenFeedVisitor = {
  id: string
  name: string
  note: string | null
}

export type ScreenTemplate = {
  show_weather: boolean
  show_clock: boolean
  show_ticker: boolean
  show_visitor_welcome: boolean
}

export type ScreenFeed = {
  screen: {
    name: string
    code: string
    orientation: SignageOrientation
    layout: SignageLayout
    heading: string | null
    area: { name: string; slug: string; building: string | null; floor: number | null } | null
    center_name: string
    theme: SignageTheme
    colors: { bg: string; panel: string | null; accent: string | null } | null
    brand_title: string | null
    brand_subtitle: string | null
    logo_url: string | null
  }
  template: ScreenTemplate
  media: ScreenFeedMedia[]
  announcements: ScreenFeedAnnouncement[]
  ticker: string[]
  wayfinding: ScreenFeedWayfinding[]
  visitors: ScreenFeedVisitor[]
  live: { live: true; hls_url: string; label: string | null } | { live: false }
  /** Board meeting takeover (opt-in screens only): preroll graphics or live stream. */
  board_takeover?: { mode: 'preroll' | 'live'; url: string; audio: boolean; label: string | null }
  weather: SignageWeather
  /** Zoned 2 only: latest published CSDtv videos for the Spotlight rail. */
  spotlight?: { id: string; title: string; thumb: string; kind: string | null; views: number | null; duration: string | null }[]
  /** Zoned 2 only: a board meeting currently live ("Now on CSDtv"). */
  csdtv_live?: { title: string; channel: number | null } | null
  /** Zoned 2 only: district news headlines + thumbnails (from the district news RSS). */
  news?: { title: string; image: string | null }[]
  /** Zoned 2 only: upcoming district closures (from the district calendar). */
  closures?: { date: string; label: string }[]
  /** Zoned 2 only: the next upcoming board meeting. */
  board_next?: { date: string; time: string; title: string } | null
  offline?: boolean
}

const ORIENTATIONS = new Set<SignageOrientation>(['landscape', 'portrait'])
const LAYOUTS = new Set<SignageLayout>(['full_bleed', 'zoned', 'zoned2', 'wayfinding'])

export function normalizeSignageOrientation(value: string): SignageOrientation {
  return ORIENTATIONS.has(value as SignageOrientation) ? (value as SignageOrientation) : 'landscape'
}

export function normalizeSignageLayout(value: string): SignageLayout {
  return LAYOUTS.has(value as SignageLayout) ? (value as SignageLayout) : 'zoned'
}

/**
 * Resolve a screen's effective layout. A screen layout of 'inherit' (or an
 * unknown/empty value) falls back to the site's default layout.
 */
export function resolveScreenLayout(
  screenLayout: string | null | undefined,
  siteDefault: string | null | undefined,
): SignageLayout {
  if (screenLayout && screenLayout !== 'inherit' && LAYOUTS.has(screenLayout as SignageLayout)) {
    return screenLayout as SignageLayout
  }
  return normalizeSignageLayout(siteDefault || 'zoned')
}
