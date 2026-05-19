import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { loadAttendance } from '@/lib/board-meetings/attendance-control'
import { getCachedBoardMemberPeople } from '@/lib/board-meetings/control-meeting-cache'
import type { EnrichedMotion } from '@/lib/board-meetings/motion-types'
import {
  cancelMotionThread,
  confirmOpenDiscussion,
  dismissVoteResult,
  holdVoteResult,
  listMotionsEnriched,
  openMotion as openMotionRecord,
  openVote as openMotionVote,
  pushVoteResult,
  recordMotionVote,
  setMotionVoteType,
  updateMotion,
  withdrawMotion,
} from '@/lib/board-meetings/motion-control'
import type {
  ActiveMotion,
  AgendaItem,
  MotionScreenBundle,
  VoteRecord,
  VotingMember,
} from '@/lib/board-meetings/motion-types'
import type { VoteMode, VoteValue } from '@/lib/board-meetings/motion-types'

export type MotionActionContext = {
  service: SupabaseClient
  boardMeetingId: string
  teamUserId: string
}

const CLOSED_MOTION_STATUSES = new Set(['withdrawn', 'tabled', 'superseded', 'replaced'])

function initials(name: string): string {
  return (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase()
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function suggestedTextForItem(item: AgendaItem | null): string {
  if (!item) return 'Move to approve the item'
  const title = item.title
  if (item.type === 'action' || /approval of|approve /i.test(title)) {
    if (/^approval of /i.test(title)) {
      return `Move to approve ${title.replace(/^approval of /i, '')}`
    }
    return `Move to ${title.replace(/^approve /i, 'approve ').toLowerCase()}`
  }
  return `Move to approve ${title}`
}

function isMotionDrafting(m: EnrichedMotion): boolean {
  return m.status === 'open_for_discussion' && (!m.moved_by_person_id || !m.seconded_by_person_id)
}

function isSubstituteInPlay(m: EnrichedMotion): boolean {
  return (
    m.motion_type === 'substitute' &&
    (isMotionDrafting(m) || m.status === 'open_for_discussion' || m.status === 'voting')
  )
}

function toActiveMotion(m: EnrichedMotion): ActiveMotion {
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

function pickActiveMotions(motions: EnrichedMotion[]): {
  active: ActiveMotion | null
  parent: ActiveMotion | null
} {
  const openMotions = motions
    .filter(m => !CLOSED_MOTION_STATUSES.has(m.status))
    .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())

  const substitute = openMotions.find(isSubstituteInPlay)
  const activeRow = substitute ?? openMotions[0]
  if (!activeRow) return { active: null, parent: null }

  const parentRow = substitute?.parent_motion_id
    ? motions.find(m => m.id === substitute.parent_motion_id) ?? null
    : null

  return {
    active: toActiveMotion(activeRow),
    parent: parentRow ? toActiveMotion(parentRow) : null,
  }
}

/**
 * Loads the full bundle the motion screen needs (uses real schema via motion-control).
 */
export async function loadMotionScreenBundle(
  service: SupabaseClient,
  productionId: string,
): Promise<MotionScreenBundle | null> {
  const { data: meeting } = await service
    .from('board_meetings')
    .select('id, production_id, title')
    .eq('production_id', productionId)
    .maybeSingle()

  if (!meeting) return null
  const meetingId = meeting.id

  const [{ data: state }, motions, people, attendance] = await Promise.all([
    service
      .from('meeting_broadcast_state')
      .select('current_agenda_item_id, elapsed_started_at')
      .eq('board_meeting_id', meetingId)
      .maybeSingle(),
    listMotionsEnriched(service, meetingId),
    getCachedBoardMemberPeople(service),
    loadAttendance(service, meetingId),
  ])

  let currentItem: AgendaItem | null = null
  if (state?.current_agenda_item_id) {
    const { data: ai } = await service
      .from('board_meeting_agenda_items')
      .select('id, item_number, title, type')
      .eq('id', state.current_agenda_item_id)
      .maybeSingle()
    if (ai) {
      currentItem = { id: ai.id, item_number: ai.item_number, title: ai.title, type: ai.type }
    }
  }

  const { active, parent } = pickActiveMotions(motions)
  const activeRow = active ? motions.find(m => m.id === active.id) : null

  const voting_members: VotingMember[] = (people || [])
    .filter(p => p.category === 'board_member')
    .map(p => ({
      id: p.id,
      display_name: p.display_name,
      district: p.affiliation || null,
      officer_position: p.officer_position || null,
      initials: initials(p.display_name),
    }))

  const attendanceByPerson = new Map(
    attendance.records.map(r => [r.person_id, r.status]),
  )

  const votes: Record<string, VoteRecord> = {}
  const tally = { yea: 0, nay: 0, abstain: 0, absent: 0 }

  if (activeRow) {
    for (const v of activeRow.votes) {
      const att = attendanceByPerson.get(v.person_id) === 'absent' ? 'absent' : 'present'
      votes[v.person_id] = {
        vote: v.vote,
        attendance: att,
        recorded_at: null,
      }
    }
  }

  for (const m of voting_members) {
    if (!votes[m.id]) {
      const att = attendanceByPerson.get(m.id) === 'absent' ? 'absent' : 'present'
      const defaultVote: VoteValue = att === 'absent' ? 'absent' : 'yea'
      votes[m.id] = { vote: defaultVote, attendance: att, recorded_at: null }
    }
    const v = votes[m.id]?.vote || 'yea'
    if (v === 'yea') tally.yea++
    else if (v === 'nay') tally.nay++
    else if (v === 'abstain') tally.abstain++
    else if (v === 'absent') tally.absent++
  }

  const liveElapsed = state?.elapsed_started_at
    ? formatElapsed(Date.now() - new Date(state.elapsed_started_at).getTime())
    : null

  return {
    meeting: { id: meeting.id, production_id: meeting.production_id, title: meeting.title },
    current_agenda_item: currentItem,
    current_agenda_item_id: state?.current_agenda_item_id || null,
    active_motion: active,
    parent_motion: parent,
    voting_members,
    votes,
    tally,
    quorum_size: attendance.quorum.threshold,
    suggested_motion_text: suggestedTextForItem(currentItem),
    live_elapsed: liveElapsed,
  }
}

/** Convenience for API routes / scripts that only have production id. */
export async function loadMotionScreenBundleByProductionId(
  productionId: string,
): Promise<MotionScreenBundle | null> {
  const service = createServiceClient()
  if (!service) return null
  return loadMotionScreenBundle(service, productionId)
}

async function suggestedTextForAgendaItem(
  service: SupabaseClient,
  agendaItemId: string | null,
): Promise<string> {
  if (!agendaItemId) return 'Move to approve the item'
  const { data: ai } = await service
    .from('board_meeting_agenda_items')
    .select('id, item_number, title, type')
    .eq('id', agendaItemId)
    .maybeSingle()
  if (!ai) return 'Move to approve the item'
  return suggestedTextForItem({
    id: ai.id,
    item_number: ai.item_number,
    title: ai.title,
    type: ai.type,
  })
}

export async function openMotion(
  ctx: MotionActionContext,
  agendaItemId: string | null,
  moverPersonId: string | null,
) {
  const motionText = await suggestedTextForAgendaItem(ctx.service, agendaItemId)
  const motion = await openMotionRecord(ctx.service, ctx.boardMeetingId, ctx.teamUserId, {
    agenda_item_id: agendaItemId,
    motion_type: 'main',
    motion_text: motionText,
    moved_by_person_id: moverPersonId,
    seconded_by_person_id: null,
  })
  return { motion_id: motion.id }
}

export async function setMover(
  ctx: MotionActionContext,
  motionId: string,
  personId: string | null,
) {
  await updateMotion(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId, {
    moved_by_person_id: personId,
  })
}

export async function setSeconder(
  ctx: MotionActionContext,
  motionId: string,
  personId: string | null,
) {
  await updateMotion(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId, {
    seconded_by_person_id: personId,
  })
}

export async function setText(ctx: MotionActionContext, motionId: string, text: string) {
  await updateMotion(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId, {
    motion_text: text,
  })
}

export async function setVoteType(
  ctx: MotionActionContext,
  motionId: string,
  voteType: VoteMode,
) {
  await setMotionVoteType(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId, voteType)
}

export async function openDiscussion(ctx: MotionActionContext, motionId: string) {
  await confirmOpenDiscussion(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId)
}

export async function openVote(ctx: MotionActionContext, motionId: string) {
  await openMotionVote(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId)
}

export async function recordVote(
  ctx: MotionActionContext,
  motionId: string,
  personId: string,
  vote: VoteValue,
) {
  await recordMotionVote(
    ctx.service,
    ctx.boardMeetingId,
    motionId,
    ctx.teamUserId,
    personId,
    vote,
  )
}

export async function pushResult(ctx: MotionActionContext, motionId: string) {
  await pushVoteResult(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId)
  return { ok: true }
}

export async function withdrawMotionById(ctx: MotionActionContext, motionId: string) {
  await withdrawMotion(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId)
}

export async function proposeSubstitute(
  ctx: MotionActionContext,
  parentMotionId: string,
  agendaItemId: string,
) {
  const motionText = await suggestedTextForAgendaItem(ctx.service, agendaItemId)
  const motion = await openMotionRecord(ctx.service, ctx.boardMeetingId, ctx.teamUserId, {
    agenda_item_id: agendaItemId,
    motion_type: 'substitute',
    parent_motion_id: parentMotionId,
    motion_text: motionText,
    moved_by_person_id: null,
    seconded_by_person_id: null,
  })
  return { substitute_motion_id: motion.id }
}

export async function cancelThread(ctx: MotionActionContext) {
  await cancelMotionThread(ctx.service, ctx.boardMeetingId, ctx.teamUserId)
}

export async function holdResult(ctx: MotionActionContext) {
  await holdVoteResult(ctx.service, ctx.boardMeetingId, ctx.teamUserId)
}

export async function dismissResult(ctx: MotionActionContext) {
  await dismissVoteResult(ctx.service, ctx.boardMeetingId, ctx.teamUserId)
}
