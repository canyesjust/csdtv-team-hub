import type { SupabaseClient } from '@supabase/supabase-js'
import { buildControlSurfaceBundle } from '@/lib/board-meetings/control-bundle'
import { loadAttendance, isEligibleToVote } from '@/lib/board-meetings/attendance-control'
import type { AttendanceStatus } from '@/lib/board-meetings/motion-types'
import {
  cancelMotionThread as cancelMotionThreadControl,
  confirmOpenDiscussion,
  dismissVoteResult,
  holdVoteResult,
  listMotionsEnriched,
  openMotion as insertMotion,
  openVote,
  pushVoteResult,
  recordMotionVote,
  setMotionVoteType,
  tableMotion,
  updateMotion,
  withdrawMotion,
  computeTally,
  getVoteResultRemainingSeconds,
} from '@/lib/board-meetings/motion-control'
import { assertBoardMeetingProduction } from '@/lib/board-meetings/meeting-api'
import { createServiceClient } from '@/lib/supabase/service'
import type {
  ActiveMotion,
  MotionScreenBundle,
  VoteRecord,
  VotingMember,
} from '@/lib/board-meetings/types'
import type { EnrichedMotion, VoteMode, VoteValue } from '@/lib/board-meetings/motion-types'
import type { MotionRouteContext } from '@/lib/board-meetings/motion-route'

const VOTE_RESULT_SECONDS = 8

export type MotionWriteContext = Pick<
  MotionRouteContext,
  'service' | 'boardMeetingId' | 'productionId' | 'teamUserId'
>

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

function formatLiveElapsed(liveStartedAt: string | null | undefined): string | null {
  if (!liveStartedAt) return null
  const ms = Date.now() - new Date(liveStartedAt).getTime()
  if (ms < 0) return null
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function buildSuggestedMotionText(
  currentItem: MotionScreenBundle['current_agenda_item'],
  agendaItems: NonNullable<Awaited<ReturnType<typeof buildControlSurfaceBundle>>>['agenda_items'],
): string | null {
  if (!currentItem) return null
  if (currentItem.consent_block) {
    const blockItems = agendaItems.filter(i => i.consent_block === currentItem.consent_block)
    if (blockItems.length > 1) {
      const first = blockItems[0].item_number
      const last = blockItems[blockItems.length - 1].item_number
      return `Move to approve the Consent Agenda items ${first} through ${last}`
    }
  }
  if (currentItem.action_requested || currentItem.type === 'action') {
    return `Move to approve ${currentItem.title}`
  }
  return `Move to approve ${currentItem.title}`
}

function buildVotesMap(
  motion: EnrichedMotion | undefined,
  attendanceRecords: {
    person_id: string
    status: string
    arrived_at?: string | null
    left_at?: string | null
  }[],
  voteMode: VoteMode | null,
): Record<string, VoteRecord> {
  const map: Record<string, VoteRecord> = {}
  const attendanceByPerson = new Map(attendanceRecords.map(r => [r.person_id, r.status]))
  const recorded = new Set<string>()

  for (const v of motion?.votes ?? []) {
    recorded.add(v.person_id)
    map[v.person_id] = {
      vote: v.vote,
      attendance: attendanceByPerson.get(v.person_id),
    }
  }

  const at = new Date()
  for (const r of attendanceRecords) {
    if (r.status === 'absent') {
      if (!map[r.person_id]) {
        map[r.person_id] = { vote: 'absent', attendance: 'absent' }
      }
      continue
    }
    if (
      voteMode === 'voice' &&
      !recorded.has(r.person_id) &&
      isEligibleToVote(r.status as AttendanceStatus, at, r.arrived_at ?? null, r.left_at ?? null)
    ) {
      map[r.person_id] = { vote: 'yea', attendance: r.status }
    }
  }

  return map
}

function computeDisplayTally(
  motion: EnrichedMotion | undefined,
  votes: Record<string, VoteRecord>,
  voteMode: VoteMode | null,
): { yea: number; nay: number; abstain: number; absent: number } {
  if (motion && (motion.status === 'voting' || motion.status === 'passed' || motion.status === 'failed')) {
    const tally = computeTally(
      Object.entries(votes).map(([, v]) => ({ vote: (v.vote || 'yea') as VoteValue })),
    )
    return { yea: tally.yea, nay: tally.nay, abstain: tally.abstain, absent: tally.absent }
  }
  if (voteMode === 'voice') {
    let yea = 0
    let nay = 0
    let abstain = 0
    let absent = 0
    for (const v of Object.values(votes)) {
      const vote = v.vote || 'yea'
      if (vote === 'yea') yea++
      else if (vote === 'nay') nay++
      else if (vote === 'abstain') abstain++
      else if (vote === 'absent') absent++
    }
    return { yea, nay, abstain, absent }
  }
  return { yea: 0, nay: 0, abstain: 0, absent: 0 }
}

async function loadVotingMembers(
  service: SupabaseClient,
  attendanceRecords: { person_id: string; name: string; status: string }[],
): Promise<VotingMember[]> {
  const { data: people } = await service
    .from('lower_third_people')
    .select('id, display_name, affiliation, officer_position')
    .eq('category', 'board_member')
    .eq('is_active', true)

  const meta = new Map(
    (people || []).map(p => [
      p.id,
      {
        display_name: p.display_name as string,
        district: (p.affiliation as string | null) ?? null,
        officer_position: (p.officer_position as string | null) ?? null,
      },
    ]),
  )

  return attendanceRecords.map(r => {
    const p = meta.get(r.person_id)
    return {
      id: r.person_id,
      display_name: p?.display_name ?? r.name,
      district: p?.district ?? null,
      officer_position: p?.officer_position ?? null,
    }
  })
}

export async function loadMotionScreenBundle(
  productionId: string,
  serviceClient?: SupabaseClient,
): Promise<MotionScreenBundle | null> {
  const service = serviceClient ?? createServiceClient()
  if (!service) return null

  const prodCheck = await assertBoardMeetingProduction(service, productionId)
  if ('error' in prodCheck) return null

  const resolvedId = prodCheck.productionId
  const surface = await buildControlSurfaceBundle(service, resolvedId)
  if (!surface) return null

  const attendance = await loadAttendance(service, surface.board_meeting.id)
  const motions = await listMotionsEnriched(service, surface.board_meeting.id)
  const lifecycle = surface.motion_lifecycle
  const agendaItems = surface.agenda_items || []

  const currentAgendaItemId = surface.broadcast_state?.current_agenda_item_id ?? null
  const currentItem = currentAgendaItemId
    ? agendaItems.find(i => i.id === currentAgendaItemId) ?? null
    : null
  const consentItems = currentItem?.consent_block
    ? agendaItems.filter(i => i.consent_block === currentItem.consent_block)
    : []
  const consentRange =
    consentItems.length > 1
      ? `${consentItems[0].item_number} – ${consentItems[consentItems.length - 1].item_number}`
      : null

  const status = surface.broadcast_state?.status ?? surface.board_meeting.broadcast_status
  const canControl =
    surface.board_meeting.agenda_locked && status !== 'archived' && status !== 'cancelled'

  let active_motion = enrichActiveMotion(lifecycle?.active_motion ?? null, motions)
  if (active_motion && lifecycle?.state === 'drafting') {
    active_motion = { ...active_motion, status: 'drafting' }
  }

  const activeRow = active_motion ? motions.find(m => m.id === active_motion!.id) : undefined
  const voteMode = (activeRow?.vote_mode ?? 'voice') as VoteMode
  const voting_members = await loadVotingMembers(service, attendance.records)
  const attendanceForVotes = attendance.records.map(r => ({
    person_id: r.person_id,
    status: r.status,
    arrived_at: r.arrived_at,
    left_at: r.left_at,
  }))
  const votes = buildVotesMap(activeRow, attendanceForVotes, activeRow ? voteMode : null)
  const tally = computeDisplayTally(activeRow, votes, activeRow ? voteMode : null)

  return {
    meeting: {
      id: surface.board_meeting.id,
      production_id: resolvedId,
      title: surface.meeting?.title ?? null,
      broadcast_status: status,
      agenda_locked: surface.board_meeting.agenda_locked,
    },
    active_motion,
    parent_motion: enrichActiveMotion(lifecycle?.parent_motion ?? null, motions),
    lifecycle_state: lifecycle?.state ?? 'no_motion',
    current_agenda_item: currentItem,
    current_agenda_item_id: currentItem?.id ?? null,
    suggested_motion_text: buildSuggestedMotionText(currentItem, agendaItems),
    live_elapsed: status === 'live' ? formatLiveElapsed(surface.broadcast_state?.live_started_at) : null,
    voting_members,
    votes,
    tally,
    quorum_size: attendance.quorum.threshold,
    consent_is_lead: !!(currentItem?.consent_block && consentItems[0]?.id === currentItem.id),
    consent_range: consentRange,
    attendance: attendance.records.map(r => ({
      person_id: r.person_id,
      name: r.name,
      status: r.status,
    })),
    can_control: canControl,
    is_live: status === 'live',
    result_on_overlay: surface.result_overlay?.active ?? false,
  }
}

async function loadAgendaItem(
  service: SupabaseClient,
  boardMeetingId: string,
  agendaItemId: string,
) {
  const { data } = await service
    .from('board_meeting_agenda_items')
    .select('id, title, item_number, consent_block, action_requested, type')
    .eq('board_meeting_id', boardMeetingId)
    .eq('id', agendaItemId)
    .maybeSingle()
  return data
}

export async function openMotion(
  ctx: MotionWriteContext,
  input: { agenda_item_id: string; mover_id?: string | null },
): Promise<{ motion_id: string }> {
  const item = await loadAgendaItem(ctx.service, ctx.boardMeetingId, input.agenda_item_id)
  if (!item) throw new Error('Agenda item not found')

  const { data: allItems } = await ctx.service
    .from('board_meeting_agenda_items')
    .select('id, item_number, title, consent_block, action_requested, type')
    .eq('board_meeting_id', ctx.boardMeetingId)
    .order('sort_order', { ascending: true })

  const motionText =
    buildSuggestedMotionText(
      {
        id: item.id,
        item_number: item.item_number ?? '',
        title: item.title,
        consent_block: item.consent_block,
        type: item.type,
        action_requested: item.action_requested,
        section_number: 0,
        section_title: '',
        is_broadcastable: true,
      },
      (allItems || []).map(i => ({
        id: i.id,
        item_number: i.item_number,
        title: i.title,
        consent_block: i.consent_block,
        type: i.type,
        action_requested: i.action_requested,
        section_number: 0,
        section_title: '',
        is_broadcastable: true,
      })),
    ) || `Move to approve ${item.title}`

  const motion = await insertMotion(ctx.service, ctx.boardMeetingId, ctx.teamUserId, {
    agenda_item_id: input.agenda_item_id,
    consent_block: item.consent_block ?? null,
    motion_type: 'main',
    motion_text: motionText,
    moved_by_person_id: input.mover_id ?? null,
    seconded_by_person_id: null,
  })

  return { motion_id: motion.id }
}

export async function setMotionMover(
  ctx: MotionWriteContext,
  motionId: string,
  personId: string | null,
): Promise<void> {
  await updateMotion(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId, {
    moved_by_person_id: personId,
  })
}

export async function setMotionSeconder(
  ctx: MotionWriteContext,
  motionId: string,
  personId: string | null,
): Promise<void> {
  await updateMotion(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId, {
    seconded_by_person_id: personId,
  })
}

export async function setMotionText(
  ctx: MotionWriteContext,
  motionId: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Motion text is required')
  await updateMotion(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId, {
    motion_text: trimmed,
  })
}

export async function setMotionVoteTypeApi(
  ctx: MotionWriteContext,
  motionId: string,
  voteType: VoteMode,
): Promise<void> {
  if (voteType !== 'voice' && voteType !== 'roll_call') {
    throw new Error('vote_type must be voice or roll_call')
  }
  await setMotionVoteType(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId, voteType)
}

export async function openMotionDiscussion(
  ctx: MotionWriteContext,
  motionId: string,
): Promise<void> {
  await confirmOpenDiscussion(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId)
}

export async function openMotionVote(
  ctx: MotionWriteContext,
  motionId: string,
): Promise<void> {
  const motion = await ctx.service
    .from('meeting_motions')
    .select('vote_mode')
    .eq('id', motionId)
    .eq('board_meeting_id', ctx.boardMeetingId)
    .maybeSingle()
  const voteMode = (motion.data?.vote_mode as VoteMode | null) || 'voice'
  await openVote(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId, voteMode)
}

export async function recordVote(
  ctx: MotionWriteContext,
  motionId: string,
  personId: string,
  vote: VoteValue,
): Promise<void> {
  await recordMotionVote(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId, personId, vote)
}

export async function pushResult(
  ctx: MotionWriteContext,
  motionId: string,
): Promise<{ result: 'passed' | 'failed'; overlay_active_until: string }> {
  await pushVoteResult(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId, VOTE_RESULT_SECONDS)

  const { data: motion } = await ctx.service
    .from('meeting_motions')
    .select('result')
    .eq('id', motionId)
    .maybeSingle()

  const result = (motion?.result === 'passed' ? 'passed' : 'failed') as 'passed' | 'failed'
  const overlay_active_until = new Date(Date.now() + VOTE_RESULT_SECONDS * 1000).toISOString()
  return { result, overlay_active_until }
}

export async function withdrawMotionApi(ctx: MotionWriteContext, motionId: string): Promise<void> {
  const { data: motion } = await ctx.service
    .from('meeting_motions')
    .select('motion_type, parent_motion_id, status')
    .eq('id', motionId)
    .eq('board_meeting_id', ctx.boardMeetingId)
    .maybeSingle()

  if (!motion) throw new Error('Motion not found')

  await withdrawMotion(ctx.service, ctx.boardMeetingId, motionId, ctx.teamUserId)

  if (motion.motion_type === 'substitute' && motion.parent_motion_id) {
    await ctx.service
      .from('meeting_motions')
      .update({ status: 'open_for_discussion', updated_at: new Date().toISOString() })
      .eq('id', motion.parent_motion_id)
    await ctx.service
      .from('meeting_broadcast_state')
      .update({
        active_motion_id: motion.parent_motion_id,
        updated_at: new Date().toISOString(),
        updated_by: ctx.teamUserId,
      })
      .eq('board_meeting_id', ctx.boardMeetingId)
  }
}

export async function proposeSubstitute(
  ctx: MotionWriteContext,
  parentMotionId: string,
  agendaItemId: string,
): Promise<{ substitute_motion_id: string }> {
  const { data: parent } = await ctx.service
    .from('meeting_motions')
    .select('id, status, motion_text')
    .eq('id', parentMotionId)
    .eq('board_meeting_id', ctx.boardMeetingId)
    .maybeSingle()

  if (!parent) throw new Error('Parent motion not found')

  if (['voting', 'open_for_discussion'].includes(parent.status)) {
    await tableMotion(ctx.service, ctx.boardMeetingId, parentMotionId, ctx.teamUserId)
  }

  const item = await loadAgendaItem(ctx.service, ctx.boardMeetingId, agendaItemId)
  const motionText = item?.title
    ? `I move to substitute the following motion regarding ${item.title}`
    : 'I move to substitute the following motion'

  const substitute = await insertMotion(ctx.service, ctx.boardMeetingId, ctx.teamUserId, {
    agenda_item_id: agendaItemId,
    motion_type: 'substitute',
    parent_motion_id: parentMotionId,
    motion_text: motionText,
    moved_by_person_id: null,
    seconded_by_person_id: null,
  })

  return { substitute_motion_id: substitute.id }
}

export async function cancelMotionThreadApi(ctx: MotionWriteContext): Promise<void> {
  await cancelMotionThreadControl(ctx.service, ctx.boardMeetingId, ctx.teamUserId)
}

export async function holdResult(ctx: MotionWriteContext): Promise<void> {
  await holdVoteResult(ctx.service, ctx.boardMeetingId, ctx.teamUserId)
}

export async function dismissResult(ctx: MotionWriteContext): Promise<void> {
  await dismissVoteResult(ctx.service, ctx.boardMeetingId, ctx.teamUserId)
}

export { getVoteResultRemainingSeconds }
