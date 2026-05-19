import { NextResponse } from 'next/server'
import { withMotionContext, motionError } from '@/lib/board-meetings/motion-route'
import { openMotion } from '@/lib/board-meetings/motion-api'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withMotionContext(production_id, async ctx => {
    const body = await request.json().catch(() => null)
    if (!body || typeof body.agenda_item_id !== 'string' || !body.agenda_item_id) {
      return motionError('agenda_item_id is required')
    }
    const moverId =
      body.mover_id === null || body.mover_id === undefined
        ? null
        : typeof body.mover_id === 'string'
          ? body.mover_id
          : null
    if (body.mover_id !== undefined && body.mover_id !== null && typeof body.mover_id !== 'string') {
      return motionError('mover_id must be a string or null')
    }
    try {
      const result = await openMotion(ctx, {
        agenda_item_id: body.agenda_item_id,
        mover_id: moverId,
      })
      return NextResponse.json(result)
    } catch (e) {
      return motionError(e instanceof Error ? e.message : 'Failed to open motion')
    }
  })
}
