import { NextResponse } from 'next/server'
import { withBoardMeetingProduction } from '@/lib/board-meetings/production-route'
import { reopenMeeting } from '@/lib/board-meetings/meeting-lifecycle'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  return withBoardMeetingProduction(params, async ({ service, teamUser, productionId }) => {
    const { data: bm } = await service
      .from('board_meetings')
      .select('id')
      .eq('production_id', productionId)
      .maybeSingle()

    if (!bm) return NextResponse.json({ error: 'Board meeting not found' }, { status: 404 })

    try {
      await reopenMeeting(service, bm.id, teamUser.id)
      return NextResponse.json({ success: true })
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Reopen failed' },
        { status: 400 },
      )
    }
  })
}
