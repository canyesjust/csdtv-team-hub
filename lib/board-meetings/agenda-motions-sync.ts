import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveSuggestedMotionText } from '@/lib/board-meetings/suggested-motion-text'
import { CLOSED_MOTION_STATUSES } from '@/lib/board-meetings/motion-active-pick'

export type AgendaMotionItemRow = {
  id: string
  title: string
  type?: string | null
  action_requested?: boolean | null
  suggested_motion_text?: string | null
}

export function isAgendaItemMotionEligible(item: {
  type?: string | null
  action_requested?: boolean | null
}): boolean {
  return item.type === 'action' || !!item.action_requested
}

export function motionTextForAgendaItem(item: AgendaMotionItemRow): string {
  return resolveSuggestedMotionText({
    id: item.id,
    item_number: '',
    title: item.title,
    type: item.type,
    suggested_motion_text: item.suggested_motion_text,
  })
}

type MotionRow = {
  id: string
  agenda_item_id: string | null
  status: string
  motion_type: string
  parent_motion_id: string | null
  motion_text: string
  moved_by_person_id?: string | null
  seconded_by_person_id?: string | null
}

/** Main motion still being prepared (no floor activity yet). */
export function isPlannedMainMotion(m: MotionRow): boolean {
  if (m.motion_type !== 'main' || m.parent_motion_id) return false
  if (CLOSED_MOTION_STATUSES.has(m.status)) return false
  if (m.status === 'voting' || m.status === 'passed' || m.status === 'failed') return false
  return true
}

export function pickMainMotionForAgendaItem(
  motions: MotionRow[],
  agendaItemId: string,
): MotionRow | null {
  const forItem = motions.filter(m => m.agenda_item_id === agendaItemId)
  if (forItem.length === 0) return null

  const mains = forItem.filter(m => m.motion_type === 'main' && !m.parent_motion_id)
  const pool = mains.length > 0 ? mains : forItem

  const inPlay = pool.find(m => !CLOSED_MOTION_STATUSES.has(m.status))
  if (inPlay) return inPlay

  return pool[0] ?? null
}

/** Id of the main motion to focus when this agenda item is on air. */
export async function findPrimaryMotionIdForAgendaItem(
  service: SupabaseClient,
  boardMeetingId: string,
  agendaItemId: string,
): Promise<string | null> {
  const { data: item } = await service
    .from('board_meeting_agenda_items')
    .select('id, title, type, action_requested')
    .eq('id', agendaItemId)
    .eq('board_meeting_id', boardMeetingId)
    .maybeSingle()

  if (!item || !isAgendaItemMotionEligible(item)) return null

  const { data: motions } = await service
    .from('meeting_motions')
    .select('id, agenda_item_id, status, motion_type, parent_motion_id, motion_text')
    .eq('board_meeting_id', boardMeetingId)
    .eq('agenda_item_id', agendaItemId)

  const picked = pickMainMotionForAgendaItem((motions || []) as MotionRow[], agendaItemId)
  return picked?.id ?? null
}

export async function syncMotionTextForAgendaItem(
  service: SupabaseClient,
  boardMeetingId: string,
  agendaItemId: string,
): Promise<void> {
  const { data: item } = await service
    .from('board_meeting_agenda_items')
    .select('id, title, type, action_requested, suggested_motion_text')
    .eq('id', agendaItemId)
    .eq('board_meeting_id', boardMeetingId)
    .maybeSingle()

  if (!item || !isAgendaItemMotionEligible(item)) return

  const text = motionTextForAgendaItem(item as AgendaMotionItemRow)

  const { data: motions } = await service
    .from('meeting_motions')
    .select('id, agenda_item_id, status, motion_type, parent_motion_id, motion_text')
    .eq('board_meeting_id', boardMeetingId)
    .eq('agenda_item_id', agendaItemId)

  const planned = pickMainMotionForAgendaItem((motions || []) as MotionRow[], agendaItemId)
  if (!planned || !isPlannedMainMotion(planned)) return
  if (planned.motion_text === text) return

  await service
    .from('meeting_motions')
    .update({ motion_text: text, updated_at: new Date().toISOString() })
    .eq('id', planned.id)
}

/**
 * Ensures each action agenda item has a main motion row (draft on the floor).
 * Called after agenda extraction/replace and when templates change.
 */
export async function syncAgendaMotions(
  service: SupabaseClient,
  boardMeetingId: string,
  openedBy?: string | null,
): Promise<{ created: number; updated: number }> {
  const [{ data: items }, { data: existing }] = await Promise.all([
    service
      .from('board_meeting_agenda_items')
      .select('id, title, type, action_requested, suggested_motion_text')
      .eq('board_meeting_id', boardMeetingId),
    service
      .from('meeting_motions')
      .select(
        'id, agenda_item_id, status, motion_type, parent_motion_id, motion_text, moved_by_person_id, seconded_by_person_id',
      )
      .eq('board_meeting_id', boardMeetingId)
      .eq('motion_type', 'main')
      .is('parent_motion_id', null),
  ])

  const byAgenda = new Map<string, MotionRow[]>()
  for (const m of (existing || []) as MotionRow[]) {
    if (!m.agenda_item_id) continue
    const list = byAgenda.get(m.agenda_item_id) || []
    list.push(m)
    byAgenda.set(m.agenda_item_id, list)
  }

  const eligibleIds = new Set<string>()
  let created = 0
  let updated = 0

  for (const item of items || []) {
    if (!isAgendaItemMotionEligible(item)) continue
    eligibleIds.add(item.id)

    const text = motionTextForAgendaItem(item as AgendaMotionItemRow)
    const motions = byAgenda.get(item.id) || []
    const planned = motions.find(isPlannedMainMotion)

    if (planned) {
      if (planned.motion_text !== text) {
        await service
          .from('meeting_motions')
          .update({ motion_text: text, updated_at: new Date().toISOString() })
          .eq('id', planned.id)
        updated++
      }
      continue
    }

    if (motions.some(m => m.status === 'passed' || m.status === 'failed' || m.status === 'voting')) {
      continue
    }

    const { error } = await service.from('meeting_motions').insert({
      board_meeting_id: boardMeetingId,
      agenda_item_id: item.id,
      motion_type: 'main',
      motion_text: text,
      status: 'open_for_discussion',
      opened_by: openedBy ?? null,
    })
    if (!error) created++
  }

  for (const m of (existing || []) as MotionRow[]) {
    if (!m.agenda_item_id || eligibleIds.has(m.agenda_item_id)) continue
    if (!isPlannedMainMotion(m)) continue
    if (m.moved_by_person_id || m.seconded_by_person_id) continue
    await service.from('meeting_motions').delete().eq('id', m.id)
  }

  return { created, updated }
}
