import { NextResponse } from 'next/server'
import { withControlContext } from '@/lib/board-meetings/control-route'
import { loadMotionScreenBundle } from '@/lib/board-meetings/motion-api'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  return withControlContext(
    id,
    async ({ service, productionId }) => {
    const bundle = await loadMotionScreenBundle(service, productionId)
    if (!bundle) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    return NextResponse.json(bundle)
  },
    { notifyOutputs: false },
  )
}
