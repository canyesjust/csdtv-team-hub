import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { assertBoardMeetingProduction } from '@/lib/board-meetings/meeting-api'

export type ControlContext = {
  service: SupabaseClient
  teamUserId: string
  productionId: string
  boardMeetingId: string
}

const boardMeetingIdCache = new Map<string, { boardMeetingId: string; expires: number }>()
const BOARD_MEETING_CACHE_MS = 60_000

export async function withControlContext(
  productionId: string,
  handler: (ctx: ControlContext) => Promise<NextResponse>,
): Promise<NextResponse> {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const prodCheck = await assertBoardMeetingProduction(service, productionId)
  if ('error' in prodCheck) {
    return NextResponse.json({ error: prodCheck.error }, { status: prodCheck.status || 400 })
  }

  const resolvedProductionId = prodCheck.productionId

  const cached = boardMeetingIdCache.get(resolvedProductionId)
  if (cached && cached.expires > Date.now()) {
    return handler({
      service,
      teamUserId: teamUser.id,
      productionId: resolvedProductionId,
      boardMeetingId: cached.boardMeetingId,
    })
  }

  const { data: bm } = await service
    .from('board_meetings')
    .select('id, broadcast_status, agenda_locked')
    .eq('production_id', resolvedProductionId)
    .maybeSingle()

  if (!bm) return NextResponse.json({ error: 'Board meeting not found' }, { status: 404 })

  boardMeetingIdCache.set(resolvedProductionId, {
    boardMeetingId: bm.id,
    expires: Date.now() + BOARD_MEETING_CACHE_MS,
  })

  return handler({
    service,
    teamUserId: teamUser.id,
    productionId: resolvedProductionId,
    boardMeetingId: bm.id,
  })
}

export function controlError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}
