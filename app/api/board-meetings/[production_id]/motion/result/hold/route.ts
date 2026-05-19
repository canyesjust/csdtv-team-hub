import { NextResponse } from 'next/server'
import { withMotionContext, motionError } from '@/lib/board-meetings/motion-route'
import { holdResult } from '@/lib/board-meetings/motion-api'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withMotionContext(production_id, async ctx => {
    try {
      await holdResult(ctx)
      return NextResponse.json({ ok: true })
    } catch (e) {
      return motionError(e instanceof Error ? e.message : 'Failed to hold result')
    }
  })
}
