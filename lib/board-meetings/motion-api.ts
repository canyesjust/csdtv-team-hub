import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { loadAttendance } from '@/lib/board-meetings/attendance-control'
import { resolveBoardMeetingRouteContext } from '@/lib/board-meetings/meeting-api'
import { getCachedBoardMemberPeople } from '@/lib/board-meetings/control-meeting-cache'
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
  AgendaItem,
  MotionScreenBundle,
  VoteRecord,
  VotingMember,
} from '@/lib/board-meetings/motion-types'
import type { VoteMode, VoteValue } from '@/lib/board-meetings/motion-types'
import { pickActiveMotions } from '@/lib/board-meetings/motion-active-pick'

export type MotionActionContext = {
  service: SupabaseClient
  boardMeetingId: string
  teamUserId: string
}

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

function suggestedTextFromTitleHeuristic(item: AgendaItem): string {
  const title = item.title
  if (item.type === 'action' || /approval of|approve /i.test(title)) {
    if (/^approval of /i.test(title)) {
      return `Move to approve ${title.replace(/^approval of /i, '')}`
    }
    return `Move to ${title.replace(/^approve /i, 'approve ').toLowerCase()}`
  }
  return `Move to approve ${title}`
}

/** Agenda template when set; otherwise title/type heuristics. */
export function resolveSuggestedMotionText(item: AgendaItem | null): string {
  if (!item) return 'Move to approve the item'
  const template = item.suggested_motion_text?.trim()
  if (template) return template
  return suggestedTextFromTitleHeuristic(item)
}

/**
 * Loads the full bundle the motion screen needs (uses real schema via motion-control).
 */
export async function loadMotionScreenBundle(
  service: SupabaseClient,
  productionId: string,
): Promise<MotionScreenBundle | null> {
  const routeCtx = await resolveBoardMeetingRouteContext(service, productionId)
  if (!routeCtx) return null

  const meetingId = routeCtx.boardMeetingId

  const [{ data: state }, motions, people, attendance] = await Promise.all([
    service
      .from('meeting_broadcast_state')
      .select('current_agenda_item_id, elapsed_started_at, active_motion_id')
      .eq('board_meeting_id', meetingId)
      .maybeSingle(),
    listMotionsEnriched(service, meetingId, { openOnly: true }),
    getCachedBoardMemberPeople(service),
    loadAttendance(service, meetingId),
  ])

  let currentItem: AgendaItem | null = null
  if (state?.current_agenda_item_id) {
    const { data: ai } = await service
      .from('board_meeting_agenda_items')
      .select('id, item_number, title, type, suggested_motion_text')
      .eq('id', state.current_agenda_item_id)
      .maybeSingle()
    if (ai) {
      currentItem = {
        id: ai.id,
        item_number: ai.item_number,
        title: ai.title,
        type: ai.type,
        suggested_motion_text: ai.suggested_motion_text,
      }
    }
  }

  const { active, parent, activeRow } = pickActiveMotions(motions, state?.active_motion_id)

  const voting_members: VotingMember[] = (people || [])
    .filter(p => p.category === 'board_member')
    .map(p => ({
      id: p.id,
      display_name: p.display_name,
      district: p.affiliation || null,
      officer_position: p.officer_position || null,
      initials: initials(p.display_name),
    }))

  const votes: Record<string, VoteRecord> = {}
  const tally = { yea: 0, nay: 0, abstain: 0, absent: 0 }

  if (activeRow) {
    for (const v of activeRow.votes) {
      votes[v.person_id] = {
        vote: v.vote,
        attendance: v.vote === 'absent' ? 'absent' : 'present',
        recorded_at: null,
      }
    }
  }

  for (const m of voting_members) {
    if (!votes[m.id]) {
      votes[m.id] = { vote: 'yea', attendance: 'present', recorded_at: null }
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
    meeting: {
      id: routeCtx.boardMeetingId,
      production_id: routeCtx.productionId,
      title: routeCtx.title,
    },
    current_agenda_item: currentItem,
    current_agenda_item_id: state?.current_agenda_item_id || null,
    active_motion: active,
    parent_motion: parent,
    voting_members,
    votes,
    tally,
    quorum_size: attendance.quorum.threshold,
    suggested_motion_text: resolveSuggestedMotionText(currentItem),
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
    .select('id, item_number, title, type, suggested_motion_text')
    .eq('id', agendaItemId)
    .maybeSingle()
  if (!ai) return 'Move to approve the item'
  return resolveSuggestedMotionText({
    id: ai.id,
    item_number: ai.item_number,
    title: ai.title,
    type: ai.type,
    suggested_motion_text: ai.suggested_motion_text,
  })
}

export async function openMotion(
  ctx: MotionActionContext,
  agendaItemId: string | null,
  moverPersonId: string | null,
  motionTextOverride?: string | null,
) {
  const trimmedOverride = motionTextOverride?.trim()
  const motionText =
    trimmedOverride ||
    (await suggestedTextForAgendaItem(ctx.service, agendaItemId))
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
  const { data: motion } = await ctx.service
    .from('meeting_motions')
    .select('vote_mode')
    .eq('id', motionId)
    .eq('board_meeting_id', ctx.boardMeetingId)
    .maybeSingle()
  if (!motion) throw new Error('Motion not found')
  const voteMode = (motion.vote_mode || 'voice') as VoteMode
  await openMotionVote(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId, voteMode)
}

export async function recordVote(
  ctx: MotionActionContext,
  motionId: string,
  personId: string,
  vote: VoteValue,
) {
  return recordMotionVote(
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
