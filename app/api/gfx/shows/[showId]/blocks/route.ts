import { NextResponse } from 'next/server'
import { withGraphicsControl, controlError } from '@/lib/graphics/control'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params
  return withGraphicsControl(showId, async ctx => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 60) : 'NEW BLOCK'

    const { data: last } = await ctx.service
      .from('graphics_blocks').select('sort_order').eq('show_id', ctx.showId)
      .order('sort_order', { ascending: false }).limit(1).maybeSingle()

    const { data, error } = await ctx.service
      .from('graphics_blocks')
      .insert({ show_id: ctx.showId, label, sort_order: last ? Number(last.sort_order) + 10 : 10 })
      .select('id').single()
    if (error) return controlError('Could not create the block', 500)
    return NextResponse.json({ success: true, id: data.id })
  })
}
