import { NextResponse } from 'next/server'
import { withGraphicsControl, controlError, sanitizeGraphic } from '@/lib/graphics/control'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ showId: string; itemId: string }> },
) {
  const { showId, itemId } = await params
  return withGraphicsControl(showId, async ctx => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const patch: Record<string, unknown> = {}
    if (typeof body.label === 'string') patch.label = body.label.slice(0, 80)
    if ('graphic' in body) {
      const graphic = sanitizeGraphic(body.graphic)
      if (!graphic) return controlError('Unknown or malformed graphic')
      patch.graphic = graphic
    }
    if (body.sort_order !== undefined) {
      const n = Number(body.sort_order)
      if (!Number.isFinite(n)) return controlError('sort_order must be a number')
      patch.sort_order = n
    }
    if (Object.keys(patch).length === 0) return controlError('Nothing to update')

    const { error } = await ctx.service
      .from('graphics_shelf_items').update(patch).eq('id', itemId).eq('show_id', ctx.showId)
    if (error) return controlError('Could not update the shelf item', 500)
    return NextResponse.json({ success: true })
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ showId: string; itemId: string }> },
) {
  const { showId, itemId } = await params
  return withGraphicsControl(showId, async ctx => {
    const { error } = await ctx.service
      .from('graphics_shelf_items').delete().eq('id', itemId).eq('show_id', ctx.showId)
    if (error) return controlError('Could not delete the shelf item', 500)
    return NextResponse.json({ success: true })
  })
}
