import type {
  ActiveMotion,
  MotionScreenBundle,
  VoteRecord,
  VoteValue,
} from '@/lib/board-meetings/motion-types'

/** Client placeholder until POST /motion/open returns a real id. */
export const PENDING_MOTION_ID = '__pending_motion__'

export function isPendingMotionId(id: string | undefined | null): boolean {
  return !id || id === PENDING_MOTION_ID
}

function memberName(bundle: MotionScreenBundle, personId: string | null): string | null {
  if (!personId) return null
  return bundle.voting_members.find(m => m.id === personId)?.display_name ?? null
}

export function buildOpenOptimisticMotion(
  bundle: MotionScreenBundle,
  body?: { agenda_item_id?: string | null; mover_id?: string | null; motion_text?: string | null },
  pendingMotionText?: string | null,
): ActiveMotion {
  const moverId = body?.mover_id ?? null
  const text =
    body?.motion_text?.trim() ||
    pendingMotionText?.trim() ||
    bundle.suggested_motion_text
  return {
    id: PENDING_MOTION_ID,
    motion_type: 'main',
    text,
    agenda_item_id: body?.agenda_item_id ?? bundle.current_agenda_item_id,
    mover_id: moverId,
    mover_name: memberName(bundle, moverId),
    seconder_id: null,
    seconder_name: null,
    vote_type: 'voice',
    status: 'drafting',
    parent_motion_id: null,
    created_at: new Date().toISOString(),
  }
}

export function buildOpenApiPayload(
  bundle: MotionScreenBundle,
  body?: Record<string, unknown>,
  pendingMotionText?: string | null,
) {
  const motion_text =
    (typeof body?.motion_text === 'string' && body.motion_text.trim()) ||
    pendingMotionText?.trim() ||
    bundle.suggested_motion_text
  return {
    agenda_item_id: (body?.agenda_item_id as string | null | undefined) ?? bundle.current_agenda_item_id,
    mover_id: (body?.mover_id as string | null | undefined) ?? null,
    motion_text,
  }
}

export const VOTE_CYCLE: Record<VoteValue, VoteValue> = {
  yea: 'nay',
  nay: 'abstain',
  abstain: 'absent',
  absent: 'yea',
  recused: 'recused',
}

export function nextVote(current: VoteValue): VoteValue {
  return VOTE_CYCLE[current] ?? 'yea'
}

export function tallyFromVotes(
  votes: Record<string, VoteRecord>,
  memberIds: string[],
): MotionScreenBundle['tally'] {
  const tally = { yea: 0, nay: 0, abstain: 0, absent: 0 }
  for (const id of memberIds) {
    const v = votes[id]?.vote || 'yea'
    if (v === 'yea') tally.yea++
    else if (v === 'nay') tally.nay++
    else if (v === 'abstain') tally.abstain++
    else if (v === 'absent') tally.absent++
  }
  return tally
}

export function applyVoteToBundle(
  bundle: MotionScreenBundle,
  personId: string,
  vote: VoteValue,
): MotionScreenBundle {
  const votes: Record<string, VoteRecord> = {
    ...bundle.votes,
    [personId]: {
      vote,
      attendance: vote === 'absent' ? 'absent' : 'present',
      recorded_at: null,
    },
  }
  const memberIds = bundle.voting_members.map(m => m.id)
  const tally = tallyFromVotes(votes, memberIds)
  const active = bundle.active_motion
  const active_motion =
    active && active.status === 'open_for_discussion'
      ? { ...active, status: 'voting' as const }
      : active

  return { ...bundle, votes, tally, active_motion }
}

export function applyVoiceVoteDefaults(bundle: MotionScreenBundle): MotionScreenBundle {
  const votes: Record<string, VoteRecord> = { ...bundle.votes }
  for (const m of bundle.voting_members) {
    votes[m.id] = { vote: 'yea', attendance: 'present', recorded_at: null }
  }
  const memberIds = bundle.voting_members.map(m => m.id)
  const active = bundle.active_motion
  return {
    ...bundle,
    votes,
    tally: tallyFromVotes(votes, memberIds),
    active_motion: active
      ? { ...active, status: 'voting', vote_type: active.vote_type || 'voice' }
      : active,
  }
}
