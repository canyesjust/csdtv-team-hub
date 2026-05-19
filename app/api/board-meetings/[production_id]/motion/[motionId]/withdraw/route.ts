import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { withdrawMotion } from '@/lib/board-meetings/motion-control'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ production_id: string; motionId: string }> },
) {
  const { production_id, motionId } = await params
  return withControlContext(production_id, async ({ service, boardMeetingId, teamUserId }) => {
    try {
      await withdrawMotion(service, boardMeetingId, motionId, teamUserId)
      return NextResponse.json({ ok: true })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to withdraw motion')
    }
  })
}
