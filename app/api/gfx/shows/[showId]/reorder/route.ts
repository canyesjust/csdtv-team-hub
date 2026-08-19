import { NextResponse } from 'next/server'
import { withGraphicsControl, controlError } from '@/lib/graphics/control'

export const dynamic = 'force-dynamic'

/**
 * Move a row. The client sends where it landed; the server recomputes a
 * sort_order between its new neighbours so nothing renumbers.
 */
export async function POST(request: Request, { params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params
  return withGraphicsControl(showId, async ctx => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const rowId = typeof body.row_id === 'string' ? body.row_id : null
    const targetId = typeof body.target_row_id === 'string' ? body.target_row_id : null
    const before = body.before !== false
    if (!rowId || !targetId) return controlError('row_id and target_row_id required')
    if (rowId === targetId) return NextResponse.json({ success: true })

    const { data: rows } = await ctx.service
      .from('graphics_rows')
      .select('id, sort_order, block_id')
      .eq('show_id', ctx.showId)
      .order('sort_order', { ascending: true })
    if (!rows) return controlError('Could not read the rundown', 500)

    const targetIndex = rows.findIndex(r => r.id === targetId)
    if (targetIndex < 0) return controlError('Target row not found', 404)
    const target = rows[targetIndex]

    const neighbourIndex = before ? targetIndex - 1 : targetIndex + 1
    const neighbour = rows[neighbourIndex]
    const targetOrder = Number(target.sort_order)

    let newOrder: number
    if (!neighbour) newOrder = before ? targetOrder - 10 : targetOrder + 10
    else newOrder = (targetOrder + Number(neighbour.sort_order)) / 2

    const { error } = await ctx.service
      .from('graphics_rows')
      .update({ sort_order: newOrder, block_id: target.block_id })
      .eq('id', rowId)
      .eq('show_id', ctx.showId)
    if (error) return controlError('Could not move the row', 500)
    return NextResponse.json({ success: true, sort_order: newOrder })
  })
}
