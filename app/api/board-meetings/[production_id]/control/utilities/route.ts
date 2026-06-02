import { NextResponse } from 'next/server'
import { withControlContext } from '@/lib/board-meetings/control-route'
import { loadControlUtilities } from '@/lib/board-meetings/control-utilities'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(
    production_id,
    async ({ service, boardMeetingId }) => {
    const utilities = await loadControlUtilities(service, boardMeetingId)
    return NextResponse.json(utilities)
  },
    { notifyOutputs: false },
  )
}
