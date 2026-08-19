import { GRAPHICS_LAYERS, type AirEntry, type GraphicPayload, type GraphicsLayer } from '@/lib/graphics/types'
import { templateById } from '@/lib/graphics/templates'

/**
 * Layer policy. This is the rule that stops a full-screen slate sitting over
 * the rest of the show.
 *
 * Rundown rows own the story layers (full, lower). The shelf owns the
 * persistent ones (corner, ticker). Taking a row clears anything a *row* put
 * up, unless the incoming row replaces that layer or the row is flagged hold.
 * Shelf graphics are never cleared by a take, which is precisely the line
 * between what the director drives and what the graphics operator owns.
 */
export const ROW_OWNED_LAYERS: GraphicsLayer[] = ['full', 'lower']

export function layerOf(graphic: GraphicPayload | null | undefined): GraphicsLayer | null {
  const t = templateById(graphic?.tid)
  return t ? t.layer : null
}

export function defaultOutSeconds(layer: GraphicsLayer, source: 'row' | 'shelf', tid?: string): number {
  if (source !== 'row') return 0
  if (layer !== 'lower') return 0
  const t = templateById(tid)
  return t?.recommendedSeconds ?? 0
}

export type TakeResult = {
  /** Layers to delete from graphics_air. */
  clear: GraphicsLayer[]
  /** Entry to upsert, if the row carries a graphic. */
  put: { layer: GraphicsLayer; graphic: GraphicPayload; out_seconds: number } | null
}

export function resolveTake(args: {
  current: Pick<AirEntry, 'layer' | 'source'>[]
  incoming: GraphicPayload | null
  holdFull: boolean
}): TakeResult {
  const incomingLayer = layerOf(args.incoming)
  const clear: GraphicsLayer[] = []

  if (!args.holdFull) {
    for (const layer of ROW_OWNED_LAYERS) {
      const entry = args.current.find(e => e.layer === layer)
      if (entry && entry.source === 'row' && layer !== incomingLayer) clear.push(layer)
    }
  }

  const put =
    args.incoming && incomingLayer
      ? {
          layer: incomingLayer,
          graphic: args.incoming,
          out_seconds: defaultOutSeconds(incomingLayer, 'row', args.incoming.tid),
        }
      : null

  return { clear, put }
}

/** Stack order for rendering. Later entries paint on top. */
export function sortAirForRender(entries: AirEntry[]): AirEntry[] {
  const order = new Map<GraphicsLayer, number>(GRAPHICS_LAYERS.map((l, i) => [l, i]))
  return [...entries].sort((a, b) => (order.get(a.layer) ?? 0) - (order.get(b.layer) ?? 0))
}
