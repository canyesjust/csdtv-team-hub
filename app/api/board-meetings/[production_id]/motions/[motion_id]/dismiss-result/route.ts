import { NextResponse } from 'next/server'
import { withControlContext } from '@/lib/board-meetings/control-route'
import { dismissVoteResult } from '@/lib/board-meetings/motion-control'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ production_id: string; motion_id: string }> },
) {
  const { production_id, motion_id } = await params
  return withControlContext(production_id, async ({ service, boardMeetingId, teamUserId }) => {
    await dismissVoteResult(service, boardMeetingId, teamUserId, motion_id)
    return NextResponse.json({ ok: true })
  })
}
