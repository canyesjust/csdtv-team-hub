import type { SupabaseClient } from '@supabase/supabase-js'
import { logMeetingEvent } from '@/lib/board-meetings/broadcast-control'

export async function unlockAgenda(
  service: SupabaseClient,
  productionId: string,
): Promise<{ id: string }> {
  const { data: bm } = await service
    .from('board_meetings')
    .select('id, agenda_locked, broadcast_status')
    .eq('production_id', productionId)
    .maybeSingle()

  if (!bm) throw new Error('Board meeting not found')
  if (!bm.agenda_locked) throw new Error('Agenda is not locked')
  if (bm.broadcast_status === 'live') {
    throw new Error('Cannot unlock while the meeting is live. End the meeting from the control surface first.')
  }
  if (bm.broadcast_status === 'archived' || bm.broadcast_status === 'cancelled') {
    throw new Error('Reopen the meeting before unlocking the agenda.')
  }

  const { error } = await service
    .from('board_meetings')
    .update({
      agenda_locked: false,
      agenda_locked_at: null,
      agenda_locked_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bm.id)

  if (error) throw new Error(error.message)
  return { id: bm.id }
}

export async function reopenMeeting(
  service: SupabaseClient,
  boardMeetingId: string,
  operatorId: string,
): Promise<void> {
  const { data: bm } = await service
    .from('board_meetings')
    .select('broadcast_status, agenda_locked')
    .eq('id', boardMeetingId)
    .single()

  if (!bm) throw new Error('Board meeting not found')
  if (bm.broadcast_status !== 'archived' && bm.broadcast_status !== 'cancelled') {
    throw new Error('Only archived or cancelled meetings can be reopened')
  }
  if (!bm.agenda_locked) {
    throw new Error('Agenda must be locked before reopening a meeting')
  }

  const { error } = await service
    .from('board_meetings')
    .update({
      broadcast_status: 'prepared',
      updated_at: new Date().toISOString(),
    })
    .eq('id', boardMeetingId)

  if (error) throw new Error(error.message)
  await logMeetingEvent(service, boardMeetingId, 'reopen_meeting', operatorId)
}

export async function resetBoardMeeting(
  service: SupabaseClient,
  productionId: string,
): Promise<void> {
  const { data: bm } = await service
    .from('board_meetings')
    .select('id, broadcast_status')
    .eq('production_id', productionId)
    .maybeSingle()

  if (!bm) throw new Error('Board meeting not found')
  if (bm.broadcast_status === 'live') {
    throw new Error('Cannot reset while the meeting is live. End the meeting first.')
  }

  const { error } = await service.from('board_meetings').delete().eq('id', bm.id)
  if (error) throw new Error(error.message)
}
