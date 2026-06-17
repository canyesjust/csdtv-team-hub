import { NextRequest, NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { publishMotionText } from '@/lib/board-meetings/motion-api'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return withControlContext(id, async c => {
    try {
      const body = (await req.json().catch(() => ({}))) as { text?: string; agenda_item_id?: string | null }
      const result = await publishMotionText(c, {
        text: body.text ?? '',
        agendaItemId: body.agenda_item_id ?? null,
      })
      return NextResponse.json(result)
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to update text on screen', 500)
    }
  })
}
