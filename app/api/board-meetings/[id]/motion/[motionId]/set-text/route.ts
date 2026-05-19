import { NextRequest, NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { setText } from '@/lib/board-meetings/motion-api'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; motionId: string }> }) {
  const { id, motionId } = await ctx.params
  return withControlContext(id, async c => {
    try {
      const body = await req.json()
      await setText(c, motionId, body.text || '')
      return NextResponse.json({ ok: true })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to set text', 500)
    }
  })
}
