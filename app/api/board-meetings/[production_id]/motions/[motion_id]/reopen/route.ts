import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { reopenMotion } from '@/lib/board-meetings/motion-control'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ production_id: string; motion_id: string }> },
) {
  const { production_id, motion_id } = await params
  return withControlContext(production_id, async ({ service, boardMeetingId, teamUserId }) => {
    try {
      await reopenMotion(service, boardMeetingId, motion_id, teamUserId)
      return NextResponse.json({ ok: true })
    } catch (e) {
      return controlError(e instanceof Error ? e.message : 'Failed to reopen motion')
    }
  })
}
