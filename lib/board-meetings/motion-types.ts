export type AttendanceStatus = 'present' | 'absent' | 'remote' | 'left_early' | 'arrived_late'
export type MotionStatus =
  | 'open_for_discussion'
  | 'voting'
  | 'passed'
  | 'failed'
  | 'withdrawn'
  | 'tabled'
  | 'replaced'
  | 'superseded'
export type VoteMode = 'voice' | 'roll_call'
export type VoteValue = 'yea' | 'nay' | 'absent' | 'abstain' | 'recused'
export type MotionResult = 'passed' | 'failed'

export type VoteTally = {
  yea: number
  nay: number
  abstain: number
  absent: number
  recused: number
}

export type PersonRef = { id: string; name: string; title?: string | null }

export type MotionVoteRow = {
  person_id: string
  vote: VoteValue
  person?: PersonRef
}

export type MotionRow = {
  id: string
  board_meeting_id: string
  agenda_item_id: string | null
  consent_block: string | null
  motion_type: string
  parent_motion_id: string | null
  motion_text: string
  moved_by_person_id: string | null
  seconded_by_person_id: string | null
  status: MotionStatus
  vote_mode: VoteMode | null
  result: MotionResult | null
  tally_yea: number | null
  tally_nay: number | null
  tally_abstain: number | null
  tally_absent: number | null
  tally_recused: number | null
  replaced_by_motion_id: string | null
  opened_at: string
  voted_at: string | null
  resolved_at: string | null
}

export type LowerThirdPersonSnippet = {
  id: string
  display_name: string
  primary_title: string | null
}

export type EnrichedMotionVote = {
  person_id: string
  vote: VoteValue
  person: LowerThirdPersonSnippet | null
}

export type EnrichedMotion = MotionRow & {
  moved_by: LowerThirdPersonSnippet | null | undefined
  seconded_by: LowerThirdPersonSnippet | null | undefined
  votes: EnrichedMotionVote[]
  tally: VoteTally
}

export type PublicActiveMotion = {
  id: string
  motion_text: string
  moved_by_name: string
  seconded_by_name: string
  motion_type: string
  status: string
  is_consent_block: boolean
  consent_block_label: string | null
  parent_motion_text: string | null
}

export type PublicActiveVoteResult = {
  motion_id: string
  result: string
  motion_text: string
  tally: VoteTally
  votes: { person_name: string; vote: string }[]
  remaining_seconds: number
}
