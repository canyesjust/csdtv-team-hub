import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { reshowResult } from '@/lib/board-meetings/motion-api'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as { motion_id?: string | null }
  return withControlContext(id, async c => {
    try {
      const result = await reshowResult(c, body?.motion_id ?? null)
      return NextResponse.json({ ok: true, ...result })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to show result', 500)
    }
  })
}
