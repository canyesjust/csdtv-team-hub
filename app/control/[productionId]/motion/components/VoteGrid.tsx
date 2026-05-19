'use client'

import VoteInterface, { type VoterRow } from '@/app/dashboard/board-meetings/[productionId]/control/components/VoteInterface'
import type { VoteMode, VoteValue } from '@/lib/board-meetings/motion-types'

export default function VoteGrid({
  voteMode,
  setVoteMode,
  voters,
  voteDraft,
  onChange,
  disabled,
}: {
  voteMode: VoteMode
  setVoteMode: (mode: VoteMode) => void
  voters: VoterRow[]
  voteDraft: Record<string, VoteValue | null>
  onChange: (personId: string, vote: VoteValue | null) => void
  disabled?: boolean
}) {
  return (
    <div className="ms-vote-grid">
      <div className="control-btn-row">
        <button
          type="button"
          className={`cs-touchbtn${voteMode === 'voice' ? ' cs-touchbtn-primary' : ''}`}
          disabled={disabled}
          onClick={() => setVoteMode('voice')}
        >
          Voice
        </button>
        <button
          type="button"
          className={`cs-touchbtn${voteMode === 'roll_call' ? ' cs-touchbtn-primary' : ''}`}
          disabled={disabled}
          onClick={() => setVoteMode('roll_call')}
        >
          Roll call
        </button>
      </div>
      <VoteInterface mode={voteMode} voters={voters} votes={voteDraft} onChange={onChange} />
    </div>
  )
}
