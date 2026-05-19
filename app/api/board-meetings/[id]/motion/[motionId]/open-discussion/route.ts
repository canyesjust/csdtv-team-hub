import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { openDiscussion } from '@/lib/board-meetings/motion-api'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, ctx: { params: Promise<{ id: string; motionId: string }> }) {
  const { id, motionId } = await ctx.params
  return withControlContext(id, async c => {
    try {
      await openDiscussion(c, motionId)
      return NextResponse.json({ ok: true })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to open discussion', 500)
    }
  })
}
