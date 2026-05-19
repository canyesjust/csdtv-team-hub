import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServerSession } from '@/lib/auth'
import { assertBoardMeetingAccess } from '@/lib/board-meetings/access'
import { createServiceClient } from '@/lib/supabase/service'

export type MotionRouteContext = {
  service: SupabaseClient
  teamUserId: string
  productionId: string
  boardMeetingId: string
}

export function motionError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function withMotionContext(
  productionId: string,
  handler: (ctx: MotionRouteContext) => Promise<NextResponse>,
): Promise<NextResponse> {
  const session = await getServerSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()
  if (!service) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { data: teamUser, error: teamError } = await service
    .from('team')
    .select('id, role')
    .eq('supabase_user_id', session.user.id)
    .maybeSingle()

  if (teamError || !teamUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await assertBoardMeetingAccess(service, teamUser, productionId)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  return handler({
    service,
    teamUserId: teamUser.id,
    productionId: access.productionId,
    boardMeetingId: access.boardMeetingId,
  })
}

export async function assertMotionInMeeting(
  service: SupabaseClient,
  motionId: string,
  boardMeetingId: string,
): Promise<boolean> {
  const { data } = await service
    .from('meeting_motions')
    .select('id')
    .eq('id', motionId)
    .eq('board_meeting_id', boardMeetingId)
    .maybeSingle()
  return !!data
}
