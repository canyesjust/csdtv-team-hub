import { NextResponse } from 'next/server'
import {
  withGraphicsControl, controlError, sanitizeGraphic, isLayer, putGraphic, clearLayers,
} from '@/lib/graphics/control'
import { defaultOutSeconds } from '@/lib/graphics/layers'
import { GRAPHICS_LAYERS, type GraphicsLayer } from '@/lib/graphics/types'
import { templateById } from '@/lib/graphics/templates'

export const dynamic = 'force-dynamic'

/**
 * Direct graphic control, which is what the graphics operator drives.
 *
 *   { action: 'put',       graphic: {...} }   fire a shelf graphic
 *   { action: 'clear',     layer: 'lower'  }  take one layer out
 *   { action: 'clear_all'                  }  everything out
 */
export async function POST(request: Request, { params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params
  return withGraphicsControl(showId, async ctx => {
    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown; layer?: unknown; graphic?: unknown
    }

    switch (body.action) {
      case 'put': {
        const graphic = sanitizeGraphic(body.graphic)
        if (!graphic) return controlError('Unknown or malformed graphic')
        const template = templateById(graphic.tid)!
        await putGraphic(
          ctx.service, ctx.showId, graphic, 'shelf',
          defaultOutSeconds(template.layer, 'shelf', graphic.tid), null,
        )
        return NextResponse.json({ success: true, layer: template.layer })
      }
      case 'clear': {
        if (!isLayer(body.layer)) return controlError('Unknown layer')
        await clearLayers(ctx.service, ctx.showId, [body.layer])
        return NextResponse.json({ success: true })
      }
      case 'clear_all': {
        await clearLayers(ctx.service, ctx.showId, [...GRAPHICS_LAYERS] as GraphicsLayer[])
        return NextResponse.json({ success: true })
      }
      default:
        return controlError('Unknown action')
    }
  })
}
