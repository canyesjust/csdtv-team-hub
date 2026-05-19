import { NextResponse } from 'next/server'
import { withControlContext } from '@/lib/board-meetings/control-route'
import { buildControlLiveBundle } from '@/lib/board-meetings/control-live-bundle'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(production_id, async ({ service, boardMeetingId }) => {
    const { data: bm } = await service
      .from('board_meetings')
      .select('broadcast_status, scheduled_public_start')
      .eq('id', boardMeetingId)
      .single()

    if (!bm) return NextResponse.json({ error: 'Board meeting not found' }, { status: 404 })

    const live = await buildControlLiveBundle(service, boardMeetingId, bm)
    return NextResponse.json(live)
  })
}
