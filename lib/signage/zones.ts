// Layout builder — per-screen zone configuration for the zoned2 layout.
//
// The zoned2 layout has a fixed big media cell plus four SWAPPABLE slots: three
// stacked right-rail cells (top / mid / bottom) and the bottom news band. This
// module is the single source of truth for which widgets can go in each slot and
// how a raw `signage_screens.zone_config` value resolves to a concrete config.
// Both renderers (ScreenClient + build-screen-html) and the builder UI import it,
// so the catalog can't drift.

// Widgets that fit a narrow/tall rail cell.
export const RAIL_WIDGETS = ['brand', 'weather', 'directions', 'announcements', 'board', 'spotlight'] as const
export type RailWidget = (typeof RAIL_WIDGETS)[number]

// Widgets that fit the wide/short bottom band.
export const BAND_WIDGETS = ['news', 'directions', 'announcements'] as const
export type BandWidget = (typeof BAND_WIDGETS)[number]

export type ZoneConfig = {
  railTop: RailWidget
  railMid: RailWidget
  railBottom: RailWidget
  band: BandWidget
}

// The current, hard-coded zoned2 arrangement. A screen with no zone_config (or an
// invalid one) renders exactly this, so nothing changes until someone edits it.
export const DEFAULT_ZONE_CONFIG: ZoneConfig = {
  railTop: 'brand',
  railMid: 'weather',
  railBottom: 'board',
  band: 'news',
}

export const RAIL_WIDGET_LABELS: Record<RailWidget, string> = {
  brand: 'Brand & clock',
  weather: 'Weather',
  directions: 'Directions',
  announcements: 'Announcements',
  board: 'Board & closures',
  spotlight: 'CSDtv spotlight',
}

export const BAND_WIDGET_LABELS: Record<BandWidget, string> = {
  news: 'District news',
  directions: 'Directions',
  announcements: 'Announcements',
}

function railOr(value: unknown, fallback: RailWidget): RailWidget {
  return (RAIL_WIDGETS as readonly string[]).includes(value as string) ? (value as RailWidget) : fallback
}

function bandOr(value: unknown, fallback: BandWidget): BandWidget {
  return (BAND_WIDGETS as readonly string[]).includes(value as string) ? (value as BandWidget) : fallback
}

/** Resolve a raw jsonb zone_config into a complete, validated ZoneConfig. */
export function resolveZoneConfig(raw: unknown): ZoneConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_ZONE_CONFIG
  const r = raw as Record<string, unknown>
  return {
    railTop: railOr(r.railTop, DEFAULT_ZONE_CONFIG.railTop),
    railMid: railOr(r.railMid, DEFAULT_ZONE_CONFIG.railMid),
    railBottom: railOr(r.railBottom, DEFAULT_ZONE_CONFIG.railBottom),
    band: bandOr(r.band, DEFAULT_ZONE_CONFIG.band),
  }
}

/** True when a config equals the default arrangement (nothing customized). */
export function isDefaultZoneConfig(c: ZoneConfig): boolean {
  return (
    c.railTop === DEFAULT_ZONE_CONFIG.railTop &&
    c.railMid === DEFAULT_ZONE_CONFIG.railMid &&
    c.railBottom === DEFAULT_ZONE_CONFIG.railBottom &&
    c.band === DEFAULT_ZONE_CONFIG.band
  )
}
