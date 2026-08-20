/** Shared types for the live graphics system. */

export const GRAPHICS_EVENT_TYPES = ['concert', 'game', 'parade', 'ceremony', 'other'] as const
export type GraphicsEventType = (typeof GRAPHICS_EVENT_TYPES)[number]

export const GRAPHICS_SHOW_STATES = ['draft', 'rehearsal', 'live', 'done'] as const
export type GraphicsShowState = (typeof GRAPHICS_SHOW_STATES)[number]

/** Logical layers. One graphic per layer at a time, which makes doubles impossible. */
export const GRAPHICS_LAYERS = ['corner', 'ticker', 'lower', 'full'] as const
export type GraphicsLayer = (typeof GRAPHICS_LAYERS)[number]

export const GRAPHICS_LAYER_LABELS: Record<GraphicsLayer, string> = {
  corner: 'Corner',
  ticker: 'Ticker',
  lower: 'Lower third',
  full: 'Full screen',
}

/** Motion families. Declared on the template so motion is a property, not hand-written. */
export const GRAPHICS_MOTION = ['wipeL', 'wipeR', 'drop', 'rise', 'slate'] as const
export type GraphicsMotion = (typeof GRAPHICS_MOTION)[number]

export type GraphicPayload = {
  /** Template id, e.g. 'concert_piece'. */
  tid: string
  data: Record<string, string>
}

export type AudioCue = {
  asset_id: string
  mode: 'oneshot' | 'bed'
  gain_db: number
}

export type GraphicsTheme = { g1: string; g2: string; g3: string; panel: string }

/** What the output page renders. One entry per layer. */
export type AirEntry = {
  layer: GraphicsLayer
  graphic: GraphicPayload
  source: 'row' | 'shelf'
  out_seconds: number
  taken_at: string
}

export type SchoolBrand = {
  short_name: string | null; name: string | null; mascot: string | null
  primary_color: string | null; secondary_color: string | null; accent_color: string | null
}

export type GraphicsOutputState = {
  show_id: string | null
  show_name: string | null
  state: GraphicsShowState | null
  theme: GraphicsTheme
  air: AirEntry[]
  /** Real logo art by school code, so a browser source can draw a mark. */
  marks: Record<string, { badge: string | null; wordmark: string | null }>
  schools: Record<string, SchoolBrand>
  school_code: string | null
  away_code: string | null
  /** Reserved space for an external score bug. Drawn only as a guide. */
  bug_zone: 'none' | 'tl' | 'tr' | 'bl' | 'br' | 'top' | 'bottom'
  audio: { one: AudioCue & { started_at: string } | null; bed: AudioCue | null }
  /** Server clock, so a client can correct for drift on auto-out timers. */
  server_now: string
  /** Bumped on every change so a client can tell a real patch from a re-render. */
  rev: number
}

export type GraphicsChannel = {
  id: string
  slug: string
  name: string
  note: string | null
  listening: boolean
}
