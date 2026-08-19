import { NextResponse } from 'next/server'
import { withGraphicsControl, controlError, sanitizeGraphic } from '@/lib/graphics/control'

export const dynamic = 'force-dynamic'

/** Create a row. sort_order steps by 10 so rows can be inserted between. */
export async function POST(request: Request, { params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params
  return withGraphicsControl(showId, async ctx => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

    const afterId = typeof body.after_row_id === 'string' ? body.after_row_id : null
    let sortOrder = 10
    let blockId = typeof body.block_id === 'string' ? body.block_id : null

    if (afterId) {
      const { data: anchor } = await ctx.service
        .from('graphics_rows')
        .select('sort_order, block_id')
        .eq('id', afterId)
        .eq('show_id', ctx.showId)
        .maybeSingle()
      if (anchor) {
        blockId = blockId ?? anchor.block_id
        const { data: next } = await ctx.service
          .from('graphics_rows')
          .select('sort_order')
          .eq('show_id', ctx.showId)
          .gt('sort_order', anchor.sort_order)
          .order('sort_order', { ascending: true })
          .limit(1)
          .maybeSingle()
        sortOrder = next
          ? (Number(anchor.sort_order) + Number(next.sort_order)) / 2
          : Number(anchor.sort_order) + 10
      }
    } else {
      const { data: last } = await ctx.service
        .from('graphics_rows')
        .select('sort_order')
        .eq('show_id', ctx.showId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      sortOrder = last ? Number(last.sort_order) + 10 : 10
    }

    const insert = {
      show_id: ctx.showId,
      block_id: blockId,
      page: typeof body.page === 'string' ? body.page.slice(0, 12) : '',
      slug: typeof body.slug === 'string' ? body.slug.slice(0, 200) : 'New row',
      form: typeof body.form === 'string' ? body.form.slice(0, 12) : 'LIVE',
      est_seconds: Number.isFinite(Number(body.est_seconds)) ? Math.max(0, Math.min(86400, Number(body.est_seconds))) : 30,
      is_break: body.is_break === true,
      graphic: sanitizeGraphic(body.graphic),
      sort_order: sortOrder,
    }

    const { data, error } = await ctx.service.from('graphics_rows').insert(insert).select('id').single()
    if (error) return controlError('Could not create the row', 500)
    return NextResponse.json({ success: true, id: data.id })
  })
}
