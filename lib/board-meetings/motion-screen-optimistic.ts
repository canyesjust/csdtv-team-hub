import type { MotionScreenBundle, VoteRecord, VoteValue } from '@/lib/board-meetings/motion-types'

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
