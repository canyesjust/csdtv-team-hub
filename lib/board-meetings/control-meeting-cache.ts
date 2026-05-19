import type { SupabaseClient } from '@supabase/supabase-js'
import type { ControlAgendaItem, LowerThirdPerson } from '@/lib/board-meetings/types'

/** Locked agenda items per meeting — immutable until agenda is unlocked. */
const lockedAgendaByMeeting = new Map<string, ControlAgendaItem[]>()

/** Board member directory for lower-thirds / attendance — changes rarely. */
let boardMemberPeopleCache: LowerThirdPerson[] | null = null

const AGENDA_SELECT =
  'id, section_number, section_title, item_number, sort_order, title, type, is_broadcastable, action_requested, consent_block'

const PEOPLE_SELECT =
  'id, display_name, primary_title, affiliation, photo_path, alternate_titles, category, officer_position, is_active'

export function clearLockedAgendaCache(boardMeetingId: string) {
  lockedAgendaByMeeting.delete(boardMeetingId)
}

export function clearBoardMemberPeopleCache() {
  boardMemberPeopleCache = null
}

export function warmLockedAgendaCache(boardMeetingId: string, items: ControlAgendaItem[]) {
  lockedAgendaByMeeting.set(boardMeetingId, items)
}

export async function getCachedBoardMemberPeople(service: SupabaseClient): Promise<LowerThirdPerson[]> {
  if (boardMemberPeopleCache) return boardMemberPeopleCache

  const { data } = await service
    .from('lower_third_people')
    .select(PEOPLE_SELECT)
    .eq('is_active', true)
    .eq('category', 'board_member')
    .order('display_name')

  boardMemberPeopleCache = (data || []) as LowerThirdPerson[]
  return boardMemberPeopleCache
}

export async function getAgendaItemsForControl(
  service: SupabaseClient,
  boardMeetingId: string,
  agendaLocked: boolean,
): Promise<ControlAgendaItem[]> {
  if (agendaLocked) {
    const cached = lockedAgendaByMeeting.get(boardMeetingId)
    if (cached) return cached
  }

  const { data: items } = await service
    .from('board_meeting_agenda_items')
    .select(AGENDA_SELECT)
    .eq('board_meeting_id', boardMeetingId)
    .order('sort_order', { ascending: true })

  const broadcastable = (items || []).filter(i => i.is_broadcastable) as ControlAgendaItem[]

  if (agendaLocked) {
    lockedAgendaByMeeting.set(boardMeetingId, broadcastable)
  }

  return broadcastable
}
