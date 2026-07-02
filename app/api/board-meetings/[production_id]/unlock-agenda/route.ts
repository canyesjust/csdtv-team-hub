import { NextResponse } from 'next/server'
import { withBoardMeetingProduction } from '@/lib/board-meetings/production-route'
import { unlockAgenda } from '@/lib/board-meetings/meeting-lifecycle'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  return withBoardMeetingProduction(params, async ({ service, productionId }) => {
    try {
      await unlockAgenda(service, productionId)
      return NextResponse.json({ success: true })
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Unlock failed' },
        { status: 400 },
      )
    }
  })
}
