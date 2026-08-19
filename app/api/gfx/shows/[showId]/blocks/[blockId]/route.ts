import { NextResponse } from 'next/server'
import { withGraphicsControl, controlError } from '@/lib/graphics/control'

export const dynamic = 'force-dynamic'

const ANCHORS = ['none', 'hard_start', 'hard_out', 'soft_target']

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ showId: string; blockId: string }> },
) {
  const { showId, blockId } = await params
  return withGraphicsControl(showId, async ctx => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const patch: Record<string, unknown> = {}
    if (typeof body.label === 'string') patch.label = body.label.slice(0, 60)
    if (typeof body.anchor_type === 'string' && ANCHORS.includes(body.anchor_type)) patch.anchor_type = body.anchor_type
    if (typeof body.anchor_at === 'string') {
      const parsed = Date.parse(body.anchor_at)
      if (!Number.isFinite(parsed)) return controlError('anchor_at is not a valid time')
      patch.anchor_at = new Date(parsed).toISOString()
    } else if (body.anchor_at === null) patch.anchor_at = null
    if (body.sort_order !== undefined) {
      const n = Number(body.sort_order)
      if (!Number.isFinite(n)) return controlError('sort_order must be a number')
      patch.sort_order = n
    }
    if (Object.keys(patch).length === 0) return controlError('Nothing to update')

    const { error } = await ctx.service.from('graphics_blocks').update(patch).eq('id', blockId).eq('show_id', ctx.showId)
    if (error) return controlError('Could not update the block', 500)
    return NextResponse.json({ success: true })
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ showId: string; blockId: string }> },
) {
  const { showId, blockId } = await params
  return withGraphicsControl(showId, async ctx => {
    const { error } = await ctx.service.from('graphics_blocks').delete().eq('id', blockId).eq('show_id', ctx.showId)
    if (error) return controlError('Could not delete the block', 500)
    return NextResponse.json({ success: true })
  })
}
