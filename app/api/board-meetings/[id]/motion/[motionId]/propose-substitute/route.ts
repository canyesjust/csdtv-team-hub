import { NextRequest, NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { proposeSubstitute } from '@/lib/board-meetings/motion-api'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; motionId: string }> }) {
  const { id, motionId } = await ctx.params
  return withControlContext(id, async c => {
    try {
      const body = await req.json()
      const result = await proposeSubstitute(c, motionId, body.agenda_item_id)
      return NextResponse.json(result)
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to propose substitute', 500)
    }
  })
}
