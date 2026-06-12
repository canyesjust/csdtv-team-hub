import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'

export const dynamic = 'force-dynamic'

// Mark (or clear) the moment the YouTube stream went live — the video's 0:00 and the
// anchor for chapter timestamps. POST { clear: true } resets it. Distinct from go-live.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(production_id, async ({ service, boardMeetingId }) => {
    const body = (await request.json().catch(() => ({}))) as { clear?: boolean }
    const stream_started_at = body.clear ? null : new Date().toISOString()
    const { error } = await service
      .from('board_meetings')
      .update({ stream_started_at, updated_at: new Date().toISOString() })
      .eq('id', boardMeetingId)
    if (error) {
      return controlError(
        error.message.includes('stream_started_at')
          ? 'stream_started_at column missing — run db/board_meetings_stream_started_at.sql'
          : error.message,
      )
    }
    return NextResponse.json({ success: true, stream_started_at })
  })
}
