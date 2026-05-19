import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'
import { loadAttendance, upsertAttendanceBulk } from '@/lib/board-meetings/attendance-control'
import type { AttendanceStatus } from '@/lib/board-meetings/motion-types'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(production_id, async ({ service, boardMeetingId }) => {
    const data = await loadAttendance(service, boardMeetingId)
    return NextResponse.json(data)
  })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(production_id, async ({ service, boardMeetingId, teamUserId }) => {
    const body = await request.json() as {
      records?: {
        person_id: string
        status: AttendanceStatus
        arrived_at?: string | null
        left_at?: string | null
        notes?: string | null
      }[]
    }
    if (!body.records?.length) return controlError('records array required')
    await upsertAttendanceBulk(service, boardMeetingId, teamUserId, body.records)
    const data = await loadAttendance(service, boardMeetingId)
    return NextResponse.json(data)
  })
}
