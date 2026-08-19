import { NextResponse } from 'next/server'
import { withGraphicsControl, controlError } from '@/lib/graphics/control'
import { pagesToWrite } from '@/lib/graphics/pages'

export const dynamic = 'force-dynamic'

/**
 * Renumber every page from the running order. Runs after any structural change,
 * so the page column is derived rather than typed. Only rows whose page is
 * actually wrong get written.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params
  return withGraphicsControl(showId, async ctx => {
    const [{ data: blocks }, { data: rows }] = await Promise.all([
      ctx.service.from('graphics_blocks').select('id, sort_order').eq('show_id', ctx.showId),
      ctx.service.from('graphics_rows').select('id, block_id, sort_order, page').eq('show_id', ctx.showId),
    ])

    const writes = pagesToWrite(blocks || [], (rows || []) as { id: string; block_id: string | null; sort_order: number; page: string }[])
    if (writes.length === 0) return NextResponse.json({ success: true, changed: 0 })
    if (writes.length > 400) return controlError('Too many rows to renumber')

    await Promise.all(
      writes.map(w =>
        ctx.service.from('graphics_rows').update({ page: w.page }).eq('id', w.id).eq('show_id', ctx.showId)),
    )
    return NextResponse.json({ success: true, changed: writes.length })
  })
}
