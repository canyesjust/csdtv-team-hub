import type { SupabaseClient } from '@supabase/supabase-js'
import { buildControlSurfaceBundle } from '@/lib/board-meetings/control-bundle'
import { loadAttendance } from '@/lib/board-meetings/attendance-control'
import { listMotionsEnriched } from '@/lib/board-meetings/motion-control'
import { assertBoardMeetingProduction } from '@/lib/board-meetings/meeting-api'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import type { ControlBundle } from '@/lib/board-meetings/types'
import type { EnrichedMotion } from '@/lib/board-meetings/motion-types'
import type { MotionUi } from '@/app/control/[productionId]/motion/motion-screen-types'

export type MotionScreenBundle = {
  bundle: ControlBundle
  motions: MotionUi[]
  attendance: { person_id: string; name: string; status: string }[]
}

function mapMotionUi(m: EnrichedMotion): MotionUi {
  return {
    id: m.id,
    motion_text: m.motion_text,
    status: m.status,
    motion_type: m.motion_type,
    parent_motion_id: m.parent_motion_id,
    result: m.result,
    tally_yea: m.tally.yea,
    tally_nay: m.tally.nay,
    tally_abstain: m.tally.abstain,
    moved_by: m.moved_by ? { id: m.moved_by.id, display_name: m.moved_by.display_name } : null,
    seconded_by: m.seconded_by ? { id: m.seconded_by.id, display_name: m.seconded_by.display_name } : null,
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
  const bundle = await buildControlSurfaceBundle(service, resolvedId)
  if (!bundle) return null

  const [motions, attendance] = await Promise.all([
    listMotionsEnriched(service, bundle.board_meeting.id),
    loadAttendance(service, bundle.board_meeting.id),
  ])

  return {
    bundle,
    motions: motions.map(mapMotionUi),
    attendance: attendance.records.map(r => ({
      person_id: r.person_id,
      name: r.name,
      status: r.status,
    })),
  }
}
