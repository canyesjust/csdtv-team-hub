import type { SignageLayout, SignageOrientation, SignageTheme } from './constants'
import type { SignageWeather } from './weather'

export type ScreenFeedMedia = {
  id: string
  type: 'image' | 'video' | 'html'
  title: string | null
  url: string
  html: string | null
  full_screen: boolean
  display_seconds: number
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
  offline?: boolean
}

const ORIENTATIONS = new Set<SignageOrientation>(['landscape', 'portrait'])
const LAYOUTS = new Set<SignageLayout>(['full_bleed', 'zoned', 'wayfinding'])

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
