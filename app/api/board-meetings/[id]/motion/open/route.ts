import { NextRequest, NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { openMotion } from '@/lib/board-meetings/motion-api'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return withControlContext(id, async c => {
    try {
      const body = await req.json()
      const result = await openMotion(c, body.agenda_item_id ?? null, body.mover_id ?? null)
      return NextResponse.json(result)
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to open motion', 500)
    }
  })
}
