import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuthenticatedTeamUser, isStaffOrManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { assertBoardMeetingProduction } from '@/lib/board-meetings/meeting-api'
import { notifyBoardOutputsForMeeting } from '@/lib/board-meetings/output-realtime'

export type ControlContext = {
  service: SupabaseClient
  teamUserId: string
  productionId: string
  boardMeetingId: string
}

const boardMeetingIdCache = new Map<string, { boardMeetingId: string; expires: number }>()
const BOARD_MEETING_CACHE_MS = 60_000

type ControlContextOptions = {
  /** When true (default), assigned OBS outputs refresh via Realtime after a successful handler. */
  notifyOutputs?: boolean
}

async function runControlHandler(
  service: SupabaseClient,
  boardMeetingId: string,
  handler: (ctx: ControlContext) => Promise<NextResponse>,
  ctx: ControlContext,
  notifyOutputs: boolean,
): Promise<NextResponse> {
  const response = await handler(ctx)
  if (notifyOutputs && response.status >= 200 && response.status < 300) {
    try {
      await notifyBoardOutputsForMeeting(service, boardMeetingId)
    } catch {
      /* output refresh is best-effort; don't fail the control action */
    }
  }
  return response
}

export async function withControlContext(
  productionId: string,
  handler: (ctx: ControlContext) => Promise<NextResponse>,
  options: ControlContextOptions = {},
): Promise<NextResponse> {
  const notifyOutputs = options.notifyOutputs !== false
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaffOrManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const prodCheck = await assertBoardMeetingProduction(service, productionId)
  if ('error' in prodCheck) {
    return NextResponse.json({ error: prodCheck.error }, { status: prodCheck.status || 400 })
  }

  const resolvedProductionId = prodCheck.productionId

  const cached = boardMeetingIdCache.get(resolvedProductionId)
  if (cached && cached.expires > Date.now()) {
    return runControlHandler(
      service,
      cached.boardMeetingId,
      handler,
      {
        service,
        teamUserId: teamUser.id,
        productionId: resolvedProductionId,
        boardMeetingId: cached.boardMeetingId,
      },
      notifyOutputs,
    )
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

  return runControlHandler(
    service,
    bm.id,
    handler,
    {
      service,
      teamUserId: teamUser.id,
      productionId: resolvedProductionId,
      boardMeetingId: bm.id,
    },
    notifyOutputs,
  )
}

export function controlError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}
