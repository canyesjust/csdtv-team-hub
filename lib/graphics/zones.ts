/**
 * Reserved screen space.
 *
 * The score bug comes from a different service and lands on top of us as its
 * own OBS source. We do not draw it and we cannot move it, so the only thing
 * that stops a collision is knowing where it lives and staying out of it.
 *
 * Declared once per show. Everything downstream reads it: the preview draws it
 * so a student can see the space while building, the safe-area guide on the
 * output draws it, and the row editor warns when a graphic is about to sit
 * underneath it.
 *
 * All rectangles are in 1920x1080 stage coordinates, which is the only
 * coordinate system anything in here uses.
 */
export const BUG_ZONES = ['none', 'tl', 'tr', 'bl', 'br', 'top', 'bottom'] as const
export type BugZone = (typeof BUG_ZONES)[number]

export function isBugZone(value: unknown): value is BugZone {
  return typeof value === 'string' && (BUG_ZONES as readonly string[]).includes(value)
}

export const BUG_ZONE_LABEL: Record<BugZone, string> = {
  none: 'Nothing reserved',
  tl: 'Top left',
  tr: 'Top right',
  bl: 'Bottom left',
  br: 'Bottom right',
  top: 'Full width, top',
  bottom: 'Full width, bottom',
}

export type Rect = { x: number; y: number; w: number; h: number }

/** Sized for a typical corner score bug, generous rather than tight. */
const ZONE_RECTS: Record<BugZone, Rect | null> = {
  none: null,
  tl: { x: 40, y: 36, w: 640, h: 160 },
  tr: { x: 1240, y: 36, w: 640, h: 160 },
  bl: { x: 40, y: 880, w: 640, h: 164 },
  br: { x: 1240, y: 880, w: 640, h: 164 },
  top: { x: 0, y: 0, w: 1920, h: 168 },
  bottom: { x: 0, y: 912, w: 1920, h: 168 },
}

export function zoneRect(zone: BugZone): Rect | null {
  return ZONE_RECTS[zone] ?? null
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/**
 * Roughly where a lower third sits for a given position. Approximate on
 * purpose: this drives a warning, not layout, and a band that is a little wide
 * is the safe direction to be wrong in.
 */
export function lowerThirdRect(position: string | undefined): Rect {
  const [side, height] = String(position || 'left-low').split('-')
  const h = 150
  const y = (height === 'high' ? 1080 - 232 : 1080 - 96) - h
  const w = 1180
  return { x: side === 'right' ? 1920 - 80 - w : 80, y, w, h }
}

/** The full-width strip a ticker or crawl occupies. */
export const TICKER_RECT: Rect = { x: 0, y: 1010, w: 1920, h: 70 }

/** The corner bug's own resting place. */
export const CORNER_RECT: Rect = { x: 1400, y: 52, w: 460, h: 96 }

export function lowerThirdCollides(zone: BugZone, position: string | undefined): boolean {
  const rect = zoneRect(zone)
  return rect ? overlaps(rect, lowerThirdRect(position)) : false
}

export function tickerCollides(zone: BugZone): boolean {
  const rect = zoneRect(zone)
  return rect ? overlaps(rect, TICKER_RECT) : false
}

export function cornerCollides(zone: BugZone): boolean {
  const rect = zoneRect(zone)
  return rect ? overlaps(rect, CORNER_RECT) : false
}

/**
 * Where a lower third should sit by default so it clears the reserved space.
 * Prefers staying low, because a raised band over a camera is a compromise and
 * should only happen when it has to.
 */
export function safeLowerPosition(zone: BugZone, preferred = 'left-low'): string {
  if (!lowerThirdCollides(zone, preferred)) return preferred
  const [side] = String(preferred).split('-')
  const candidates = [`${side}-high`, 'left-high', 'right-high', 'left-low', 'right-low']
  return candidates.find(c => !lowerThirdCollides(zone, c)) ?? preferred
}

/** Plain sentence for the operator. Null when there is nothing to say. */
export function zoneWarning(zone: BugZone, layer: string, position?: string): string | null {
  if (zone === 'none') return null
  const where = BUG_ZONE_LABEL[zone].toLowerCase()
  if (layer === 'lower' && lowerThirdCollides(zone, position)) {
    return `This sits under the score bug (${where}). Raise it or move it to the other side.`
  }
  if (layer === 'ticker' && tickerCollides(zone)) {
    return `The score bug (${where}) covers the ticker. Only one of them can be up.`
  }
  if (layer === 'corner' && cornerCollides(zone)) {
    return `This sits under the score bug (${where}).`
  }
  return null
}
