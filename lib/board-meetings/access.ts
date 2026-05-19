import type { SupabaseClient } from '@supabase/supabase-js'
import { assertBoardMeetingProduction } from '@/lib/board-meetings/meeting-api'
import { teamUserCanUpdateProduction } from '@/lib/server/production-access'

export type BoardMeetingAccess =
  | {
      productionId: string
      boardMeetingId: string
    }
  | {
      error: string
      status: number
    }

/** Verify the team user may control this board meeting production. */
export async function assertBoardMeetingAccess(
  service: SupabaseClient,
  teamUser: { id: string; role: string },
  productionId: string,
): Promise<BoardMeetingAccess> {
  const prodCheck = await assertBoardMeetingProduction(service, productionId)
  if ('error' in prodCheck) {
    return { error: prodCheck.error, status: prodCheck.status || 400 }
  }

  const canUpdate = await teamUserCanUpdateProduction(service, teamUser, prodCheck.productionId)
  if (!canUpdate) {
    return { error: 'Forbidden', status: 403 }
  }

  const { data: bm } = await service
    .from('board_meetings')
    .select('id, agenda_locked, broadcast_status')
    .eq('production_id', prodCheck.productionId)
    .maybeSingle()

  if (!bm) return { error: 'Board meeting not found', status: 404 }

  if (!bm.agenda_locked) {
    return { error: 'Agenda must be locked before controlling the meeting', status: 400 }
  }

  if (bm.broadcast_status === 'archived' || bm.broadcast_status === 'cancelled') {
    return { error: 'Meeting is not open for control', status: 400 }
  }

  return { productionId: prodCheck.productionId, boardMeetingId: bm.id }
}
