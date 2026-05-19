'use client'

import type { VoterRow } from '@/app/dashboard/board-meetings/[productionId]/control/components/VoteInterface'
import type { VoteMode, VoteTally, VoteValue } from '@/lib/board-meetings/motion-types'
import HeldMotionCard from '../components/HeldMotionCard'
import TallyRow from '../components/TallyRow'
import VoteGrid from '../components/VoteGrid'

export default function SubstituteVotingState({
  parentMotionText,
  voteMode,
  setVoteMode,
  voters,
  voteDraft,
  onVoteChange,
  tally,
  result,
  showTally,
  disabled,
  busy,
  onRecordVote,
  onPushResult,
}: {
  parentMotionText: string
  voteMode: VoteMode
  setVoteMode: (m: VoteMode) => void
  voters: VoterRow[]
  voteDraft: Record<string, VoteValue | null>
  onVoteChange: (personId: string, vote: VoteValue | null) => void
  tally: VoteTally | null
  result: string | null
  showTally: boolean
  disabled?: boolean
  busy?: boolean
  onRecordVote: () => void
  onPushResult: () => void
}) {
  return (
    <>
      <HeldMotionCard label="Main motion (held)" motionText={parentMotionText} />
      <div className="cs-card">
        <p className="cs-eyebrow">Substitute motion — voting</p>
        <VoteGrid
          voteMode={voteMode}
          setVoteMode={setVoteMode}
          voters={voters}
          voteDraft={voteDraft}
          onChange={onVoteChange}
          disabled={disabled || busy}
        />
      </div>
      {showTally && tally ? <TallyRow tally={tally} result={result} /> : null}
      <div className="ms-actions">
        <button type="button" className="cs-touchbtn cs-touchbtn-primary" disabled={disabled || busy} onClick={onRecordVote}>
          Record substitute vote
        </button>
        <button type="button" className="cs-touchbtn" disabled={disabled || busy || !showTally} onClick={onPushResult}>
          Push result to overlay
        </button>
      </div>
    </>
  )
}
