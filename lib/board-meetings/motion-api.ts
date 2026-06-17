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
  reshowVoteResult,
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
import { loadAgendaItemRowById } from '@/lib/board-meetings/agenda-item-select'
import {
  findPrimaryMotionIdForAgendaItem,
  syncMotionTextForAgendaItem,
} from '@/lib/board-meetings/agenda-motions-sync'
import { sortByBoardSeatOrder } from '@/lib/board-meetings/lower-third-board-order'
import { pickActiveMotions } from '@/lib/board-meetings/motion-active-pick'
import { resolveSuggestedMotionText } from '@/lib/board-meetings/suggested-motion-text'

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

export { resolveSuggestedMotionText } from '@/lib/board-meetings/suggested-motion-text'

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
    const ai = await loadAgendaItemRowById(service, meetingId, state.current_agenda_item_id)
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

  const { active, parent, activeRow } = pickActiveMotions(
    motions,
    state?.active_motion_id,
    state?.current_agenda_item_id,
  )

  const voting_members: VotingMember[] = sortByBoardSeatOrder(
    (people || [])
      .filter(p => p.category === 'board_member')
      .map(p => ({
        id: p.id,
        display_name: p.display_name,
        district: p.affiliation || null,
        officer_position: p.officer_position || null,
        initials: initials(p.display_name),
      })),
  )

  // Real attendance drives each member's status (present/remote/absent), which in
  // turn pre-fills the vote grid: absent members can't vote, present default to yea.
  const att3 = (status: string): VoteRecord['attendance'] =>
    status === 'absent' || status === 'left_early' ? 'absent' : status === 'remote' ? 'remote' : 'present'
  const attMap = new Map(attendance.records.map(r => [r.person_id, att3(r.status)]))
  const recordedVote = new Map<string, VoteValue>()
  if (activeRow) for (const v of activeRow.votes) recordedVote.set(v.person_id, v.vote)

  const votes: Record<string, VoteRecord> = {}
  const tally = { yea: 0, nay: 0, abstain: 0, absent: 0 }
  for (const m of voting_members) {
    const a = attMap.get(m.id) ?? 'present'
    const vote: VoteValue = a === 'absent' ? 'absent' : (recordedVote.get(m.id) ?? 'yea')
    votes[m.id] = { vote, attendance: a, recorded_at: null }
    if (vote === 'yea') tally.yea++
    else if (vote === 'nay') tally.nay++
    else if (vote === 'abstain') tally.abstain++
    else if (vote === 'absent') tally.absent++
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
  boardMeetingId: string,
  agendaItemId: string | null,
): Promise<string> {
  if (!agendaItemId) return 'Move to approve the item'
  const ai = await loadAgendaItemRowById(service, boardMeetingId, agendaItemId)
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
  // A consent-agenda item votes as ONE motion covering the whole block, not a
  // motion per sub-item. Resolve the item's consent block first.
  let consentBlock: string | null = null
  if (agendaItemId) {
    const { data: item } = await ctx.service
      .from('board_meeting_agenda_items')
      .select('consent_block')
      .eq('id', agendaItemId)
      .maybeSingle()
    consentBlock = (item?.consent_block as string | null)?.trim() || null
  }

  // Find a motion to reuse: by consent block (shared across its items) or by item.
  let existingId: string | null = null
  if (consentBlock) {
    const { data: existing } = await ctx.service
      .from('meeting_motions')
      .select('id')
      .eq('board_meeting_id', ctx.boardMeetingId)
      .eq('consent_block', consentBlock)
      .neq('status', 'withdrawn')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    existingId = existing?.id ?? null
  } else if (agendaItemId) {
    existingId = await findPrimaryMotionIdForAgendaItem(ctx.service, ctx.boardMeetingId, agendaItemId)
  }

  if (existingId) {
    if (moverPersonId) {
      await updateMotion(ctx.service, ctx.boardMeetingId, existingId, ctx.teamUserId, {
        moved_by_person_id: moverPersonId,
      })
    }
    const trimmedOverride = motionTextOverride?.trim()
    if (trimmedOverride) {
      await updateMotion(ctx.service, ctx.boardMeetingId, existingId, ctx.teamUserId, {
        motion_text: trimmedOverride,
      })
    }
    await ctx.service
      .from('meeting_broadcast_state')
      .update({
        active_motion_id: existingId,
        updated_at: new Date().toISOString(),
        updated_by: ctx.teamUserId,
      })
      .eq('board_meeting_id', ctx.boardMeetingId)
    return { motion_id: existingId }
  }

  const trimmedOverride = motionTextOverride?.trim()
  const suggested = await suggestedTextForAgendaItem(ctx.service, ctx.boardMeetingId, agendaItemId)
  const motionText =
    trimmedOverride || suggested || (consentBlock ? 'Move to approve the Consent Agenda.' : '')
  const motion = await openMotionRecord(ctx.service, ctx.boardMeetingId, ctx.teamUserId, {
    agenda_item_id: agendaItemId,
    consent_block: consentBlock,
    motion_type: 'main',
    motion_text: motionText,
    moved_by_person_id: moverPersonId,
    seconded_by_person_id: null,
  })
  return { motion_id: motion.id }
}

export { syncAgendaMotions, syncMotionTextForAgendaItem } from '@/lib/board-meetings/agenda-motions-sync'

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
  const motionText = await suggestedTextForAgendaItem(ctx.service, ctx.boardMeetingId, agendaItemId)
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

export async function reshowResult(ctx: MotionActionContext, motionId?: string | null) {
  return reshowVoteResult(ctx.service, ctx.boardMeetingId, ctx.teamUserId, { motionId })
}
