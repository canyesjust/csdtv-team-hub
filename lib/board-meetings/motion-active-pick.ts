import { pickMainMotionForAgendaItem } from '@/lib/board-meetings/agenda-motions-sync'
import type { ActiveMotion, EnrichedMotion } from '@/lib/board-meetings/motion-types'

export const CLOSED_MOTION_STATUSES = new Set([
  'withdrawn',
  'tabled',
  'superseded',
  'replaced',
])

/** Resolved vote; only treated as active when broadcast still points at it (pre push-result). */
const TERMINAL_VOTE_STATUSES = new Set(['passed', 'failed'])

export function isMotionDrafting(m: EnrichedMotion): boolean {
  return m.status === 'open_for_discussion' && (!m.moved_by_person_id || !m.seconded_by_person_id)
}

export function isSubstituteInPlay(m: EnrichedMotion): boolean {
  return (
    m.motion_type === 'substitute' &&
    (isMotionDrafting(m) || m.status === 'open_for_discussion' || m.status === 'voting')
  )
}

export function toActiveMotion(m: EnrichedMotion): ActiveMotion {
  const motionType: ActiveMotion['motion_type'] =
    m.motion_type === 'substitute' || m.motion_type === 'amendment' ? m.motion_type : 'main'
  const status = isMotionDrafting(m) ? 'drafting' : m.status
  return {
    id: m.id,
    motion_type: motionType,
    text: m.motion_text,
    agenda_item_id: m.agenda_item_id,
    mover_id: m.moved_by_person_id,
    mover_name: m.moved_by?.display_name ?? null,
    seconder_id: m.seconded_by_person_id,
    seconder_name: m.seconded_by?.display_name ?? null,
    vote_type: (m.vote_mode || 'voice') as 'voice' | 'roll_call',
    status,
    parent_motion_id: m.parent_motion_id,
    created_at: m.opened_at,
  }
}

/**
 * Picks the motion the operator UI should focus on.
 * Prefers in-play substitute, then the current agenda item's motion, then broadcast active_motion_id.
 */
export function pickActiveMotions(
  motions: EnrichedMotion[],
  broadcastActiveMotionId?: string | null,
  currentAgendaItemId?: string | null,
): { active: ActiveMotion | null; parent: ActiveMotion | null; activeRow: EnrichedMotion | null } {
  const openMotions = motions.filter(m => !CLOSED_MOTION_STATUSES.has(m.status))

  const substitute = openMotions.find(isSubstituteInPlay)
  let activeRow: EnrichedMotion | undefined = substitute

  if (!activeRow && currentAgendaItemId) {
    const forItem = pickMainMotionForAgendaItem(motions, currentAgendaItemId)
    if (forItem) {
      activeRow = motions.find(m => m.id === forItem.id)
    }
  }

  if (!activeRow && broadcastActiveMotionId) {
    const fromBroadcast = motions.find(m => m.id === broadcastActiveMotionId)
    if (fromBroadcast && !CLOSED_MOTION_STATUSES.has(fromBroadcast.status)) {
      activeRow = fromBroadcast
    }
  }

  if (!activeRow) {
    return { active: null, parent: null, activeRow: null }
  }

  const parentRow =
    activeRow.motion_type === 'substitute' && activeRow.parent_motion_id
      ? motions.find(m => m.id === activeRow!.parent_motion_id) ?? null
      : substitute?.parent_motion_id
        ? motions.find(m => m.id === substitute.parent_motion_id) ?? null
        : null

  return {
    active: toActiveMotion(activeRow),
    parent: parentRow ? toActiveMotion(parentRow) : null,
    activeRow,
  }
}
