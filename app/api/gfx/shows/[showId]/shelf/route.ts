import { NextResponse } from 'next/server'
import { withGraphicsControl, controlError, sanitizeGraphic } from '@/lib/graphics/control'

export const dynamic = 'force-dynamic'

/** The shelf is what the graphics operator owns. Not in the running order. */
export async function POST(request: Request, { params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params
  return withGraphicsControl(showId, async ctx => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 80) : 'New card'
    const graphic = sanitizeGraphic(body.graphic)
    if (!graphic) return controlError('A shelf item needs a valid graphic')

    const { data: last } = await ctx.service
      .from('graphics_shelf_items').select('sort_order').eq('show_id', ctx.showId)
      .order('sort_order', { ascending: false }).limit(1).maybeSingle()

    const { data, error } = await ctx.service
      .from('graphics_shelf_items')
      .insert({
        show_id: ctx.showId, label, graphic,
        group_label: typeof body.group_label === 'string' && body.group_label.trim()
          ? body.group_label.trim().slice(0, 40) : null,
        sort_order: last ? Number(last.sort_order) + 10 : 10,
      })
      .select('id').single()
    if (error) return controlError('Could not add the shelf item', 500)
    return NextResponse.json({ success: true, id: data.id })
  })
}
