import type { SupabaseClient } from '@supabase/supabase-js'
import { buildControlSurfaceBundle } from '@/lib/board-meetings/control-bundle'
import { loadAttendance } from '@/lib/board-meetings/attendance-control'
import { listMotionsEnriched } from '@/lib/board-meetings/motion-control'
import { assertBoardMeetingProduction } from '@/lib/board-meetings/meeting-api'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import type { ActiveMotion, MotionScreenBundle } from '@/lib/board-meetings/types'
import type { EnrichedMotion } from '@/lib/board-meetings/motion-types'

function enrichActiveMotion(
  motion: ActiveMotion | null,
  rows: EnrichedMotion[],
): ActiveMotion | null {
  if (!motion) return null
  const row = rows.find(m => m.id === motion.id)
  if (!row) return motion
  return {
    ...motion,
    result: row.result,
    tally_yea: row.tally.yea,
    tally_nay: row.tally.nay,
    tally_abstain: row.tally.abstain,
    vote_type: (row.vote_mode || motion.vote_type) as ActiveMotion['vote_type'],
    status: row.status,
    text: row.motion_text,
    mover_id: row.moved_by_person_id,
    mover_name: row.moved_by?.display_name ?? null,
    seconder_id: row.seconded_by_person_id,
    seconder_name: row.seconded_by?.display_name ?? null,
  }
}

export async function loadMotionScreenBundle(
  productionId: string,
  serviceClient?: SupabaseClient,
): Promise<MotionScreenBundle | null> {
  const service = serviceClient ?? getServiceSupabaseClient()
  if (!service) return null

  const prodCheck = await assertBoardMeetingProduction(service, productionId)
  if ('error' in prodCheck) return null

  const resolvedId = prodCheck.productionId
  const surface = await buildControlSurfaceBundle(service, resolvedId)
  if (!surface) return null

  const motions = await listMotionsEnriched(service, surface.board_meeting.id)
  const lifecycle = surface.motion_lifecycle

  const currentId = surface.broadcast_state?.current_agenda_item_id
  const currentItem = (surface.agenda_items || []).find(i => i.id === currentId) ?? null
  const consentItems = currentItem?.consent_block
    ? surface.agenda_items.filter(i => i.consent_block === currentItem.consent_block)
    : []
  const consentRange =
    consentItems.length > 1
      ? `${consentItems[0].item_number} – ${consentItems[consentItems.length - 1].item_number}`
      : null

  const status = surface.broadcast_state?.status ?? surface.board_meeting.broadcast_status
  const canControl =
    surface.board_meeting.agenda_locked && status !== 'archived' && status !== 'cancelled'

  return {
    meeting: {
      id: surface.board_meeting.id,
      production_id: resolvedId,
      title: surface.meeting?.title ?? null,
      broadcast_status: status,
      agenda_locked: surface.board_meeting.agenda_locked,
    },
    active_motion: enrichActiveMotion(lifecycle?.active_motion ?? null, motions),
    parent_motion: enrichActiveMotion(lifecycle?.parent_motion ?? null, motions),
    lifecycle_state: lifecycle?.state ?? 'no_motion',
    current_agenda_item: currentItem,
    consent_is_lead: !!(currentItem?.consent_block && consentItems[0]?.id === currentItem.id),
    consent_range: consentRange,
    attendance: (surface.attendance?.records || []).map(r => ({
      person_id: r.person_id,
      name: r.name,
      status: r.status,
    })),
    can_control: canControl,
    is_live: status === 'live',
    result_on_overlay: surface.result_overlay?.active ?? false,
  }
}
