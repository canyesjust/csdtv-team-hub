import type { SupabaseClient } from '@supabase/supabase-js'
import { logMeetingEvent } from '@/lib/board-meetings/broadcast-control'
import {
  computeQuorum,
  ensureDefaultAttendance,
  isEligibleToVote,
  loadAttendance,
  loadBoardMembers,
} from '@/lib/board-meetings/attendance-control'
import type {
  EnrichedMotion,
  EnrichedMotionVote,
  MotionResult,
  PublicActiveMotion,
  PublicActiveVoteResult,
  VoteMode,
  VoteTally,
  VoteValue,
} from '@/lib/board-meetings/motion-types'

const VOTE_RESULT_DEFAULT_SECONDS = 8

/** One active vote per (motion, person); update in place when already recorded. */
async function upsertActiveMotionVote(
  service: SupabaseClient,
  motionId: string,
  personId: string,
  vote: VoteValue,
  operatorId: string,
) {
  const now = new Date().toISOString()
  const { data: prev } = await service
    .from('meeting_motion_votes')
    .select('id')
    .eq('motion_id', motionId)
    .eq('person_id', personId)
    .is('superseded_by_vote_id', null)
    .maybeSingle()

  if (prev) {
    const { error } = await service
      .from('meeting_motion_votes')
      .update({ vote, recorded_by: operatorId, recorded_at: now })
      .eq('id', prev.id)
    if (error) throw new Error(error.message)
    return
  }

  const { error } = await service.from('meeting_motion_votes').insert({
    motion_id: motionId,
    person_id: personId,
    vote,
    recorded_by: operatorId,
  })
  if (error) throw new Error(error.message)
}

export function computeTally(votes: { vote: VoteValue }[]): VoteTally {
  const tally: VoteTally = { yea: 0, nay: 0, abstain: 0, absent: 0, recused: 0 }
  for (const v of votes) {
    if (v.vote === 'yea') tally.yea++
    else if (v.vote === 'nay') tally.nay++
    else if (v.vote === 'abstain') tally.abstain++
    else if (v.vote === 'absent') tally.absent++
    else if (v.vote === 'recused') tally.recused++
  }
  return tally
}

export function computeMotionResult(
  tally: VoteTally,
  quorumThreshold: number,
): { result: MotionResult; quorum_met_at_vote: boolean } {
  const deciding = tally.yea + tally.nay
  const quorum_met_at_vote = deciding >= quorumThreshold
  const passed = quorum_met_at_vote && tally.yea > tally.nay
  return { result: passed ? 'passed' : 'failed', quorum_met_at_vote }
}

export function getVoteResultRemainingSeconds(bstate: {
  active_vote_result_motion_id?: string | null
  vote_result_started_at?: string | null
  vote_result_duration_seconds?: number | null
}): number {
  if (!bstate.active_vote_result_motion_id || !bstate.vote_result_started_at) return 0
  const dur = bstate.vote_result_duration_seconds ?? VOTE_RESULT_DEFAULT_SECONDS
  const end = new Date(bstate.vote_result_started_at).getTime() + dur * 1000
  return Math.max(0, Math.ceil((end - Date.now()) / 1000))
}

export function isVoteResultActive(bstate: {
  active_vote_result_motion_id?: string | null
  vote_result_started_at?: string | null
  vote_result_duration_seconds?: number | null
  vote_result_held?: boolean | null
}): boolean {
  if (!bstate.active_vote_result_motion_id) return false
  if (bstate.vote_result_held) return true
  return getVoteResultRemainingSeconds(bstate) > 0
}

async function loadMotion(service: SupabaseClient, motionId: string, boardMeetingId: string) {
  const { data } = await service
    .from('meeting_motions')
    .select('*')
    .eq('id', motionId)
    .eq('board_meeting_id', boardMeetingId)
    .maybeSingle()
  return data
}

async function setActiveMotion(
  service: SupabaseClient,
  boardMeetingId: string,
  motionId: string | null,
  operatorId: string,
) {
  await service
    .from('meeting_broadcast_state')
    .update({
      active_motion_id: motionId,
      updated_at: new Date().toISOString(),
      updated_by: operatorId,
    })
    .eq('board_meeting_id', boardMeetingId)
}

async function showVoteResult(
  service: SupabaseClient,
  boardMeetingId: string,
  motionId: string,
  operatorId: string,
  durationSeconds = VOTE_RESULT_DEFAULT_SECONDS,
) {
  const now = new Date().toISOString()
  await service
    .from('meeting_broadcast_state')
    .update({
      active_vote_result_motion_id: motionId,
      vote_result_started_at: now,
      vote_result_duration_seconds: durationSeconds,
      vote_result_held: false,
      active_motion_id: null,
      updated_at: now,
      updated_by: operatorId,
    })
    .eq('board_meeting_id', boardMeetingId)
  await logMeetingEvent(service, boardMeetingId, 'vote_result_displayed', operatorId, {
    motion_id: motionId,
    duration_seconds: durationSeconds,
  })
}

export async function pushVoteResult(
  service: SupabaseClient,
  boardMeetingId: string,
  motionId: string,
  operatorId: string,
  durationSeconds = VOTE_RESULT_DEFAULT_SECONDS,
) {
  const motion = await loadMotion(service, motionId, boardMeetingId)
  if (!motion) throw new Error('Motion not found')
  if (!['passed', 'failed', 'voting'].includes(motion.status)) {
    throw new Error('Motion must be voted before pushing a result')
  }
  if (motion.status === 'voting') {
    await finalizeMotionFromVotes(service, boardMeetingId, motionId, operatorId)
  }
  await showVoteResult(service, boardMeetingId, motionId, operatorId, durationSeconds)
}

export async function holdVoteResult(
  service: SupabaseClient,
  boardMeetingId: string,
  operatorId: string,
) {
  const { data: state } = await service
    .from('meeting_broadcast_state')
    .select('active_vote_result_motion_id')
    .eq('board_meeting_id', boardMeetingId)
    .maybeSingle()

  if (!state?.active_vote_result_motion_id) throw new Error('No vote result on overlay')

  const now = new Date().toISOString()
  await service
    .from('meeting_broadcast_state')
    .update({
      vote_result_held: true,
      updated_at: now,
      updated_by: operatorId,
    })
    .eq('board_meeting_id', boardMeetingId)

  await logMeetingEvent(service, boardMeetingId, 'vote_result_held', operatorId, {
    motion_id: state.active_vote_result_motion_id,
  })
}

export async function dismissVoteResult(
  service: SupabaseClient,
  boardMeetingId: string,
  operatorId: string,
  motionId?: string,
) {
  const { data: state } = await service
    .from('meeting_broadcast_state')
    .select('active_vote_result_motion_id')
    .eq('board_meeting_id', boardMeetingId)
    .maybeSingle()

  const mid = motionId || state?.active_vote_result_motion_id
  await service
    .from('meeting_broadcast_state')
    .update({
      active_vote_result_motion_id: null,
      vote_result_started_at: null,
      vote_result_duration_seconds: null,
      vote_result_held: false,
      updated_at: new Date().toISOString(),
      updated_by: operatorId,
    })
    .eq('board_meeting_id', boardMeetingId)

  if (mid) {
    await logMeetingEvent(service, boardMeetingId, 'vote_result_dismissed', operatorId, {
      motion_id: mid,
      ended_early: true,
    })
  }
}

export async function openMotion(
  service: SupabaseClient,
  boardMeetingId: string,
  operatorId: string,
  input: {
    agenda_item_id?: string | null
    consent_block?: string | null
    motion_type: string
    parent_motion_id?: string | null
    motion_text: string
    moved_by_person_id?: string | null
    seconded_by_person_id?: string | null
  },
) {
  const mover = input.moved_by_person_id ?? null
  const seconder = input.seconded_by_person_id ?? null
  if (mover && seconder && mover === seconder) {
    throw new Error('Mover and seconder must be different people')
  }

  await ensureDefaultAttendance(service, boardMeetingId)

  const { data: motion, error } = await service
    .from('meeting_motions')
    .insert({
      board_meeting_id: boardMeetingId,
      agenda_item_id: input.agenda_item_id ?? null,
      consent_block: input.consent_block ?? null,
      motion_type: input.motion_type,
      parent_motion_id: input.parent_motion_id ?? null,
      motion_text: input.motion_text.trim(),
      moved_by_person_id: mover,
      seconded_by_person_id: seconder,
      status: 'open_for_discussion',
      opened_by: operatorId,
    })
    .select('*')
    .single()

  if (error || !motion) throw new Error(error?.message || 'Failed to open motion')

  await setActiveMotion(service, boardMeetingId, motion.id, operatorId)
  await logMeetingEvent(service, boardMeetingId, 'motion_opened', operatorId, {
    motion_id: motion.id,
    motion_type: input.motion_type,
    parent_motion_id: input.parent_motion_id ?? null,
  })

  return motion
}

export async function updateMotion(
  service: SupabaseClient,
  boardMeetingId: string,
  motionId: string,
  operatorId: string,
  patch: {
    motion_text?: string
    moved_by_person_id?: string | null
    seconded_by_person_id?: string | null
  },
) {
  const motion = await loadMotion(service, motionId, boardMeetingId)
  if (!motion) throw new Error('Motion not found')
  const textOnly = patch.motion_text !== undefined && Object.keys(patch).length === 1
  const allowedStatuses: string[] = textOnly
    ? ['open_for_discussion', 'voting', 'passed', 'failed']
    : ['open_for_discussion', 'voting']
  if (!allowedStatuses.includes(motion.status)) {
    throw new Error('Motion cannot be edited in its current state')
  }

  const movedBy =
    patch.moved_by_person_id !== undefined ? patch.moved_by_person_id : motion.moved_by_person_id
  const secondedBy =
    patch.seconded_by_person_id !== undefined ? patch.seconded_by_person_id : motion.seconded_by_person_id
  if (movedBy && secondedBy && movedBy === secondedBy) {
    throw new Error('Mover and seconder must be different people')
  }

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.motion_text !== undefined) row.motion_text = patch.motion_text.trim()
  if (patch.moved_by_person_id !== undefined) row.moved_by_person_id = patch.moved_by_person_id
  if (patch.seconded_by_person_id !== undefined) row.seconded_by_person_id = patch.seconded_by_person_id

  const { error } = await service.from('meeting_motions').update(row).eq('id', motionId)
  if (error) throw new Error(error.message)

  await setActiveMotion(service, boardMeetingId, motionId, operatorId)
  await logMeetingEvent(service, boardMeetingId, 'motion_updated', operatorId, {
    motion_id: motionId,
    moved_by_person_id: movedBy,
    seconded_by_person_id: secondedBy,
  })
}

export async function setMotionVoteType(
  service: SupabaseClient,
  boardMeetingId: string,
  motionId: string,
  operatorId: string,
  voteMode: VoteMode,
) {
  const motion = await loadMotion(service, motionId, boardMeetingId)
  if (!motion) throw new Error('Motion not found')
  if (!['open_for_discussion', 'voting'].includes(motion.status)) {
    throw new Error('Vote type can only be set while the motion is open')
  }

  const { error } = await service
    .from('meeting_motions')
    .update({ vote_mode: voteMode, updated_at: new Date().toISOString() })
    .eq('id', motionId)
  if (error) throw new Error(error.message)

  await logMeetingEvent(service, boardMeetingId, 'vote_type_set', operatorId, {
    motion_id: motionId,
    vote_mode: voteMode,
  })
}

export async function openVote(
  service: SupabaseClient,
  boardMeetingId: string,
  motionId: string,
  operatorId: string,
  voteMode: VoteMode,
) {
  const motion = await loadMotion(service, motionId, boardMeetingId)
  if (!motion) throw new Error('Motion not found')
  if (!['open_for_discussion', 'voting'].includes(motion.status)) {
    throw new Error('Motion is not open for voting')
  }
  if (!motion.moved_by_person_id || !motion.seconded_by_person_id) {
    throw new Error('Select mover and seconder before opening the vote')
  }

  await ensureDefaultAttendance(service, boardMeetingId)

  const now = new Date().toISOString()
  await service
    .from('meeting_motions')
    .update({ status: 'voting', vote_mode: voteMode, updated_at: now })
    .eq('id', motionId)

  if (voteMode === 'voice') {
    const attendance = await loadAttendance(service, boardMeetingId)
    const at = new Date()
    for (const record of attendance.records) {
      if (!isEligibleToVote(record.status, at, record.arrived_at, record.left_at)) continue
      await upsertActiveMotionVote(service, motionId, record.person_id, 'yea', operatorId)
    }
    const { data: activeVotes } = await service
      .from('meeting_motion_votes')
      .select('vote')
      .eq('motion_id', motionId)
      .is('superseded_by_vote_id', null)
    const tally = computeTally(activeVotes || [])
    await service
      .from('meeting_motions')
      .update({
        tally_yea: tally.yea,
        tally_nay: tally.nay,
        tally_abstain: tally.abstain,
        tally_absent: tally.absent,
        tally_recused: tally.recused,
        updated_at: now,
      })
      .eq('id', motionId)
  }

  await setActiveMotion(service, boardMeetingId, motionId, operatorId)
  await logMeetingEvent(service, boardMeetingId, 'vote_opened', operatorId, { motion_id: motionId, vote_mode: voteMode })
}

export async function confirmOpenDiscussion(
  service: SupabaseClient,
  boardMeetingId: string,
  motionId: string,
  operatorId: string,
) {
  const motion = await loadMotion(service, motionId, boardMeetingId)
  if (!motion) throw new Error('Motion not found')
  if (!motion.moved_by_person_id || !motion.seconded_by_person_id) {
    throw new Error('Select mover and seconder before opening for discussion')
  }

  const now = new Date().toISOString()
  await service
    .from('meeting_motions')
    .update({ status: 'open_for_discussion', updated_at: now })
    .eq('id', motionId)

  await setActiveMotion(service, boardMeetingId, motionId, operatorId)
  await logMeetingEvent(service, boardMeetingId, 'motion_discussion_opened', operatorId, { motion_id: motionId })
}

export async function recordMotionVote(
  service: SupabaseClient,
  boardMeetingId: string,
  motionId: string,
  operatorId: string,
  personId: string,
  vote: VoteValue,
) {
  const motion = await loadMotion(service, motionId, boardMeetingId)
  if (!motion) throw new Error('Motion not found')
  if (!['open_for_discussion', 'voting', 'passed', 'failed'].includes(motion.status)) {
    throw new Error('Motion is not open for voting')
  }

  const attendance = await loadAttendance(service, boardMeetingId)
  const att = attendance.records.find(r => r.person_id === personId)
  if (!att) throw new Error('Voter must have an attendance record')

  const now = new Date()
  if (
    !isEligibleToVote(att.status, now, att.arrived_at, att.left_at) &&
    vote !== 'absent' &&
    vote !== 'recused'
  ) {
    vote = 'absent'
  }

  if (motion.status === 'open_for_discussion') {
    await service
      .from('meeting_motions')
      .update({ status: 'voting', updated_at: now.toISOString() })
      .eq('id', motionId)
  }

  await upsertActiveMotionVote(service, motionId, personId, vote, operatorId)

  const { data: activeVotes } = await service
    .from('meeting_motion_votes')
    .select('vote')
    .eq('motion_id', motionId)
    .is('superseded_by_vote_id', null)

  const tally = computeTally(activeVotes || [])
  await service
    .from('meeting_motions')
    .update({
      tally_yea: tally.yea,
      tally_nay: tally.nay,
      tally_abstain: tally.abstain,
      tally_absent: tally.absent,
      tally_recused: tally.recused,
      updated_at: now.toISOString(),
    })
    .eq('id', motionId)

  await logMeetingEvent(service, boardMeetingId, 'vote_recorded_incremental', operatorId, {
    motion_id: motionId,
    person_id: personId,
    vote,
  })
}

async function finalizeMotionFromVotes(
  service: SupabaseClient,
  boardMeetingId: string,
  motionId: string,
  operatorId: string,
) {
  const motion = await loadMotion(service, motionId, boardMeetingId)
  if (!motion) throw new Error('Motion not found')
  if (motion.status === 'passed' || motion.status === 'failed') return

  const attendance = await loadAttendance(service, boardMeetingId)
  const { data: activeVotes } = await service
    .from('meeting_motion_votes')
    .select('vote')
    .eq('motion_id', motionId)
    .is('superseded_by_vote_id', null)

  const tally = computeTally(activeVotes || [])
  const { result } = computeMotionResult(tally, attendance.quorum.threshold)
  const finalStatus = result === 'passed' ? 'passed' : 'failed'
  const voteTime = new Date().toISOString()

  await service
    .from('meeting_motions')
    .update({
      status: finalStatus,
      result,
      tally_yea: tally.yea,
      tally_nay: tally.nay,
      tally_abstain: tally.abstain,
      tally_absent: tally.absent,
      tally_recused: tally.recused,
      voted_at: voteTime,
      resolved_at: voteTime,
      updated_at: voteTime,
    })
    .eq('id', motionId)

  if (motion.motion_type === 'substitute' && motion.parent_motion_id) {
    if (result === 'passed') {
      await service
        .from('meeting_motions')
        .update({
          status: 'replaced',
          replaced_by_motion_id: motionId,
          resolved_at: voteTime,
          updated_at: voteTime,
        })
        .eq('id', motion.parent_motion_id)
      await service
        .from('meeting_motions')
        .update({ status: 'open_for_discussion', updated_at: voteTime })
        .eq('id', motionId)
      await setActiveMotion(service, boardMeetingId, motionId, operatorId)
    } else {
      await service
        .from('meeting_motions')
        .update({ status: 'open_for_discussion', updated_at: voteTime })
        .eq('id', motion.parent_motion_id)
      await setActiveMotion(service, boardMeetingId, motion.parent_motion_id, operatorId)
    }
  } else {
    await setActiveMotion(service, boardMeetingId, null, operatorId)
  }
}

export async function cancelMotionThread(
  service: SupabaseClient,
  boardMeetingId: string,
  operatorId: string,
) {
  const { data: state } = await service
    .from('meeting_broadcast_state')
    .select('active_motion_id')
    .eq('board_meeting_id', boardMeetingId)
    .maybeSingle()

  const activeId = state?.active_motion_id
  if (!activeId) return

  const motion = await loadMotion(service, activeId, boardMeetingId)
  if (!motion) return

  if (motion.motion_type === 'substitute' && motion.parent_motion_id) {
    await withdrawMotion(service, boardMeetingId, activeId, operatorId)
    await withdrawMotion(service, boardMeetingId, motion.parent_motion_id, operatorId)
    return
  }

  await withdrawMotion(service, boardMeetingId, activeId, operatorId)
}

export async function recordVotes(
  service: SupabaseClient,
  boardMeetingId: string,
  motionId: string,
  operatorId: string,
  votes: { person_id: string; vote: VoteValue }[],
  opts?: { re_record?: boolean; defer_result_display?: boolean },
) {
  const motion = await loadMotion(service, motionId, boardMeetingId)
  if (!motion) throw new Error('Motion not found')
  if (opts?.re_record) {
    if (!['passed', 'failed', 'voting'].includes(motion.status)) {
      throw new Error('Can only re-record votes on motions that are voting or already resolved')
    }
  } else if (!['open_for_discussion', 'voting'].includes(motion.status)) {
    throw new Error('Motion is not open for voting')
  }

  const attendance = await loadAttendance(service, boardMeetingId)
  const attByPerson = new Map(attendance.records.map(r => [r.person_id, r]))
  const now = new Date()
  const voteTime = now.toISOString()

  const normalizedVotes = votes.map(v => {
    if (!attByPerson.has(v.person_id)) {
      throw new Error('All voters must have attendance records; mark attendance first')
    }
    const att = attByPerson.get(v.person_id)!
    if (
      !isEligibleToVote(att.status, now, att.arrived_at, att.left_at) &&
      v.vote !== 'absent' &&
      v.vote !== 'recused'
    ) {
      return { person_id: v.person_id, vote: 'absent' as VoteValue }
    }
    return v
  })

  if (opts?.re_record) {
    const { data: oldVotes } = await service
      .from('meeting_motion_votes')
      .select('id')
      .eq('motion_id', motionId)
      .is('superseded_by_vote_id', null)

    const previousIds = (oldVotes || []).map(v => v.id)

    for (const v of normalizedVotes) {
      await upsertActiveMotionVote(service, motionId, v.person_id, v.vote, operatorId)
    }

    await logMeetingEvent(service, boardMeetingId, 'vote_re_recorded', operatorId, {
      motion_id: motionId,
      previous_vote_ids: previousIds,
    })
  } else {
    for (const v of normalizedVotes) {
      await upsertActiveMotionVote(service, motionId, v.person_id, v.vote, operatorId)
    }
  }

  const { data: activeVotes } = await service
    .from('meeting_motion_votes')
    .select('vote')
    .eq('motion_id', motionId)
    .is('superseded_by_vote_id', null)

  const tally = computeTally(activeVotes || [])
  const { result, quorum_met_at_vote } = computeMotionResult(tally, attendance.quorum.threshold)
  const finalStatus = result === 'passed' ? 'passed' : 'failed'

  await service
    .from('meeting_motions')
    .update({
      status: finalStatus,
      result,
      tally_yea: tally.yea,
      tally_nay: tally.nay,
      tally_abstain: tally.abstain,
      tally_absent: tally.absent,
      tally_recused: tally.recused,
      voted_at: voteTime,
      resolved_at: voteTime,
      updated_at: voteTime,
    })
    .eq('id', motionId)

  // Substitute resolution
  if (motion.motion_type === 'substitute' && motion.parent_motion_id) {
    if (result === 'passed') {
      await service
        .from('meeting_motions')
        .update({
          status: 'replaced',
          replaced_by_motion_id: motionId,
          resolved_at: voteTime,
          updated_at: voteTime,
        })
        .eq('id', motion.parent_motion_id)

      await logMeetingEvent(service, boardMeetingId, 'motion_replaced', operatorId, {
        motion_id: motion.parent_motion_id,
        replaced_by_motion_id: motionId,
      })

      await service
        .from('meeting_motions')
        .update({ status: 'open_for_discussion', updated_at: voteTime })
        .eq('id', motionId)

      await setActiveMotion(service, boardMeetingId, motionId, operatorId)
    } else {
      await service
        .from('meeting_motions')
        .update({ status: 'open_for_discussion', updated_at: voteTime })
        .eq('id', motion.parent_motion_id)
      await setActiveMotion(service, boardMeetingId, motion.parent_motion_id, operatorId)
    }
  } else {
    await setActiveMotion(service, boardMeetingId, null, operatorId)
  }

  if (!opts?.defer_result_display) {
    await showVoteResult(service, boardMeetingId, motionId, operatorId)
  }
  await logMeetingEvent(service, boardMeetingId, 'vote_recorded', operatorId, {
    motion_id: motionId,
    result,
    tally,
    quorum_met_at_vote,
  })

  return { motion_id: motionId, result, tally, quorum_met_at_vote }
}

export async function withdrawMotion(
  service: SupabaseClient,
  boardMeetingId: string,
  motionId: string,
  operatorId: string,
) {
  const motion = await loadMotion(service, motionId, boardMeetingId)
  if (!motion) throw new Error('Motion not found')

  await service
    .from('meeting_motions')
    .update({ status: 'withdrawn', resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', motionId)

  const { data: state } = await service
    .from('meeting_broadcast_state')
    .select('active_motion_id')
    .eq('board_meeting_id', boardMeetingId)
    .maybeSingle()

  if (state?.active_motion_id === motionId) {
    await setActiveMotion(service, boardMeetingId, null, operatorId)
  }

  await logMeetingEvent(service, boardMeetingId, 'motion_withdrawn', operatorId, { motion_id: motionId })
}

export async function tableMotion(
  service: SupabaseClient,
  boardMeetingId: string,
  motionId: string,
  operatorId: string,
) {
  await service
    .from('meeting_motions')
    .update({ status: 'tabled', updated_at: new Date().toISOString() })
    .eq('id', motionId)
    .eq('board_meeting_id', boardMeetingId)

  const { data: state } = await service
    .from('meeting_broadcast_state')
    .select('active_motion_id')
    .eq('board_meeting_id', boardMeetingId)
    .maybeSingle()

  if (state?.active_motion_id === motionId) {
    await setActiveMotion(service, boardMeetingId, null, operatorId)
  }

  await logMeetingEvent(service, boardMeetingId, 'motion_tabled', operatorId, { motion_id: motionId })
}

export async function reopenMotion(
  service: SupabaseClient,
  boardMeetingId: string,
  motionId: string,
  operatorId: string,
) {
  const motion = await loadMotion(service, motionId, boardMeetingId)
  if (!motion) throw new Error('Motion not found')
  if (motion.status !== 'tabled') throw new Error('Only tabled motions can be reopened')

  await service
    .from('meeting_motions')
    .update({ status: 'open_for_discussion', updated_at: new Date().toISOString() })
    .eq('id', motionId)

  await setActiveMotion(service, boardMeetingId, motionId, operatorId)
  await logMeetingEvent(service, boardMeetingId, 'motion_reopened', operatorId, { motion_id: motionId })
}

const CLOSED_MOTION_STATUSES_DB = ['withdrawn', 'tabled', 'superseded', 'replaced'] as const

export async function listMotionsEnriched(
  service: SupabaseClient,
  boardMeetingId: string,
  opts?: { openOnly?: boolean; voteCountsOnly?: boolean },
): Promise<EnrichedMotion[]> {
  let query = service
    .from('meeting_motions')
    .select('*')
    .eq('board_meeting_id', boardMeetingId)
    .order('opened_at', { ascending: true })

  if (opts?.openOnly) {
    const closed = CLOSED_MOTION_STATUSES_DB.map(s => `"${s}"`).join(',')
    query = query.not('status', 'in', `(${closed})`)
  }

  const { data: motions } = await query

  if (!motions?.length) return [] as EnrichedMotion[]

  const personIds = new Set<string>()
  for (const m of motions) {
    if (m.moved_by_person_id) personIds.add(m.moved_by_person_id)
    if (m.seconded_by_person_id) personIds.add(m.seconded_by_person_id)
  }

  const { data: people } = personIds.size
    ? await service.from('lower_third_people').select('id, display_name, primary_title').in('id', [...personIds])
    : { data: [] }
  const peopleMap = new Map((people || []).map(p => [p.id, p]))

  const motionIds = motions.map(m => m.id)
  const votesByMotion = new Map<string, { person_id: string; vote: string; recorded_at: string }[]>()

  if (opts?.voteCountsOnly) {
    const { data: voteRows } = await service
      .from('meeting_motion_votes')
      .select('motion_id, person_id, vote, recorded_at')
      .in('motion_id', motionIds)
      .is('superseded_by_vote_id', null)
    for (const v of voteRows || []) {
      const list = votesByMotion.get(v.motion_id) || []
      list.push(v)
      votesByMotion.set(v.motion_id, list)
    }
    return motions.map((m): EnrichedMotion => ({
      ...m,
      status: m.status as EnrichedMotion['status'],
      vote_mode: m.vote_mode as EnrichedMotion['vote_mode'],
      result: m.result as EnrichedMotion['result'],
      moved_by: m.moved_by_person_id ? peopleMap.get(m.moved_by_person_id) : null,
      seconded_by: m.seconded_by_person_id ? peopleMap.get(m.seconded_by_person_id) : null,
      votes: (votesByMotion.get(m.id) || []).map((v): EnrichedMotionVote => ({
        person_id: v.person_id,
        vote: v.vote as VoteValue,
        person: null,
      })),
      tally: {
        yea: m.tally_yea ?? 0,
        nay: m.tally_nay ?? 0,
        abstain: m.tally_abstain ?? 0,
        absent: m.tally_absent ?? 0,
        recused: m.tally_recused ?? 0,
      },
    }))
  }

  const { data: votes } = await service
    .from('meeting_motion_votes')
    .select('id, motion_id, person_id, vote, recorded_at, superseded_by_vote_id')
    .in('motion_id', motionIds)
    .is('superseded_by_vote_id', null)

  const votePersonIds = new Set((votes || []).map(v => v.person_id))
  for (const id of votePersonIds) personIds.add(id)

  let votePeopleMap = peopleMap
  if (votePersonIds.size > personIds.size - (people?.length || 0)) {
    const { data: vp } = await service
      .from('lower_third_people')
      .select('id, display_name, primary_title')
      .in('id', [...votePersonIds])
    votePeopleMap = new Map((vp || []).map(p => [p.id, p]))
  }

  for (const v of votes || []) {
    const list = votesByMotion.get(v.motion_id) || []
    list.push(v)
    votesByMotion.set(v.motion_id, list)
  }

  return motions.map((m): EnrichedMotion => ({
    ...m,
    status: m.status as EnrichedMotion['status'],
    vote_mode: m.vote_mode as EnrichedMotion['vote_mode'],
    result: m.result as EnrichedMotion['result'],
    moved_by: m.moved_by_person_id ? votePeopleMap.get(m.moved_by_person_id) : null,
    seconded_by: m.seconded_by_person_id ? votePeopleMap.get(m.seconded_by_person_id) : null,
    votes: (votesByMotion.get(m.id) || []).map((v): EnrichedMotionVote => ({
      person_id: v.person_id,
      vote: v.vote as VoteValue,
      person: votePeopleMap.get(v.person_id) ?? null,
    })),
    tally: {
      yea: m.tally_yea ?? 0,
      nay: m.tally_nay ?? 0,
      abstain: m.tally_abstain ?? 0,
      absent: m.tally_absent ?? 0,
      recused: m.tally_recused ?? 0,
    },
  }))
}

export async function buildPublicMotionPayload(
  service: SupabaseClient,
  motionId: string,
  boardMeetingId: string,
): Promise<PublicActiveMotion | null> {
  const motion = await loadMotion(service, motionId, boardMeetingId)
  if (!motion) return null

  const ids = [motion.moved_by_person_id, motion.seconded_by_person_id].filter(Boolean) as string[]
  let parentText: string | null = null
  if (motion.parent_motion_id) {
    const parent = await loadMotion(service, motion.parent_motion_id, boardMeetingId)
    parentText = parent?.motion_text ?? null
  }

  const { data: people } = ids.length
    ? await service.from('lower_third_people').select('id, display_name').in('id', ids)
    : { data: [] }
  const pmap = new Map((people || []).map(p => [p.id, p.display_name]))

  let consentBlockLabel: string | null = null
  if (motion.consent_block) {
    const { data: blockItems } = await service
      .from('board_meeting_agenda_items')
      .select('item_number')
      .eq('board_meeting_id', boardMeetingId)
      .eq('consent_block', motion.consent_block)
      .order('sort_order')
    if (blockItems?.length) {
      consentBlockLabel = `Items ${blockItems[0].item_number} through ${blockItems[blockItems.length - 1].item_number}`
    }
  }

  return {
    id: motion.id,
    motion_text: motion.motion_text,
    moved_by_name: motion.moved_by_person_id ? pmap.get(motion.moved_by_person_id) || null : null,
    seconded_by_name: motion.seconded_by_person_id ? pmap.get(motion.seconded_by_person_id) || null : null,
    motion_type: motion.motion_type,
    status: motion.status,
    is_consent_block: !!motion.consent_block,
    consent_block_label: consentBlockLabel,
    parent_motion_text: parentText,
  }
}

export async function buildPublicVoteResultPayload(
  service: SupabaseClient,
  motionId: string,
  boardMeetingId: string,
  remainingSeconds: number,
  opts?: { held?: boolean; started_at?: string; total_duration?: number },
): Promise<PublicActiveVoteResult | null> {
  const motion = await loadMotion(service, motionId, boardMeetingId)
  if (!motion || !motion.result) return null

  const { data: votes } = await service
    .from('meeting_motion_votes')
    .select('person_id, vote')
    .eq('motion_id', motionId)
    .is('superseded_by_vote_id', null)

  const personIds = (votes || []).map(v => v.person_id)
  const { data: people } = personIds.length
    ? await service.from('lower_third_people').select('id, display_name').in('id', personIds)
    : { data: [] }
  const pmap = new Map((people || []).map(p => [p.id, p.display_name]))

  return {
    motion_id: motion.id,
    result: motion.result,
    motion_text: motion.motion_text,
    tally: {
      yea: motion.tally_yea ?? 0,
      nay: motion.tally_nay ?? 0,
      abstain: motion.tally_abstain ?? 0,
      absent: motion.tally_absent ?? 0,
      recused: motion.tally_recused ?? 0,
    },
    votes: (votes || []).map(v => ({
      person_name: pmap.get(v.person_id) || 'Unknown',
      vote: v.vote,
    })),
    remaining_seconds: remainingSeconds,
    held: opts?.held ?? false,
    started_at: opts?.started_at,
    total_duration: opts?.total_duration,
  }
}

export async function getEligibleVotersForMotion(
  service: SupabaseClient,
  boardMeetingId: string,
) {
  await ensureDefaultAttendance(service, boardMeetingId)
  const attendance = await loadAttendance(service, boardMeetingId)
  const now = new Date()
  return attendance.records
    .filter(r => isEligibleToVote(r.status, now, r.arrived_at, r.left_at) || r.status !== 'absent')
    .map(r => ({
      person_id: r.person_id,
      name: r.name,
      title: r.title,
      status: r.status,
      default_vote: (r.status === 'absent' ? 'absent' : 'yea') as VoteValue,
      eligible: isEligibleToVote(r.status, now, r.arrived_at, r.left_at),
    }))
}

export { loadBoardMembers, loadAttendance, computeQuorum }
