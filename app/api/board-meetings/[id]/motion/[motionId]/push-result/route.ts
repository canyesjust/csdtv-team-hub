import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { pushResult } from '@/lib/board-meetings/motion-api'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, ctx: { params: Promise<{ id: string; motionId: string }> }) {
  const { id, motionId } = await ctx.params
  return withControlContext(id, async c => {
    try {
      const result = await pushResult(c, motionId)
      return NextResponse.json(result)
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to push result', 500)
    }
  })
}
