import { NextResponse } from 'next/server'
import { withGraphicsControl, controlError, takeRow } from '@/lib/graphics/control'

export const dynamic = 'force-dynamic'

/** Take a rundown row: stamp as-run, apply the layer policy, fire its graphic. */
export async function POST(request: Request, { params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params
  return withGraphicsControl(showId, async ctx => {
    const body = await request.json().catch(() => ({}))
    const rowId = (body as { row_id?: unknown }).row_id
    if (typeof rowId !== 'string') return controlError('row_id required')

    const result = await takeRow(ctx.service, ctx.showId, rowId)
    if (!result.ok) return controlError(result.error, 404)
    return NextResponse.json({ success: true })
  })
}
