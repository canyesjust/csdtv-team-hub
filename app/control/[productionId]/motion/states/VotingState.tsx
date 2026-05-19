'use client'

import type { VoterRow } from '@/app/dashboard/board-meetings/[productionId]/control/components/VoteInterface'
import type { VoteMode, VoteValue } from '@/lib/board-meetings/motion-types'
import TallyRow from '../components/TallyRow'
import VoteGrid from '../components/VoteGrid'
import type { VoteTally } from '@/lib/board-meetings/motion-types'

export default function VotingState({
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
      <div className="cs-card cs-motion-card--info">
        <p className="cs-eyebrow">Voting</p>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--semantic-info-text)' }}>Record votes, then push the result to the overlay.</p>
      </div>
      <VoteGrid
        voteMode={voteMode}
        setVoteMode={setVoteMode}
        voters={voters}
        voteDraft={voteDraft}
        onChange={onVoteChange}
        disabled={disabled || busy}
      />
      {showTally && tally ? <TallyRow tally={tally} result={result} /> : null}
      <div className="ms-actions">
        <button type="button" className="cs-touchbtn cs-touchbtn-primary" disabled={disabled || busy} onClick={onRecordVote}>
          Record vote
        </button>
        <button type="button" className="cs-touchbtn" disabled={disabled || busy || !showTally} onClick={onPushResult}>
          Push result to overlay
        </button>
      </div>
    </>
  )
}
