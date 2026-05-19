import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { pushVoteResult } from '@/lib/board-meetings/motion-control'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string; motionId: string }> },
) {
  const { production_id, motionId } = await params
  return withControlContext(production_id, async ({ service, boardMeetingId, teamUserId }) => {
    const body = await request.json().catch(() => ({}))
    const duration =
      typeof body.duration_seconds === 'number' ? body.duration_seconds : undefined
    try {
      await pushVoteResult(service, boardMeetingId, motionId, teamUserId, duration)
      return NextResponse.json({ ok: true })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to push result')
    }
  })
}
