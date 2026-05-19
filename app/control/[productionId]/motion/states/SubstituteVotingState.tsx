'use client'

import { useMemo, useState } from 'react'
import type { ActiveMotion } from '@/lib/board-meetings/types'
import type { VoteMode, VoteValue } from '@/lib/board-meetings/motion-types'
import type { VoterRow } from '@/app/dashboard/board-meetings/[productionId]/control/components/VoteInterface'
import HeldMotionCard from '../components/HeldMotionCard'
import MotionScreenFrame from '../components/MotionScreenFrame'
import TallyRow from '../components/TallyRow'
import VoteGrid from '../components/VoteGrid'
import { tallyFromActiveMotion, type MotionScreenStateProps } from '../motion-screen-types'

export default function SubstituteVotingState(
  props: MotionScreenStateProps & { active: ActiveMotion; parent: ActiveMotion },
) {
  const { bundle, busy, onAction, onPushResult, active, parent } = props
  const disabled = !bundle.can_control || !bundle.is_live || busy

  const [voteMode, setVoteMode] = useState<VoteMode>(active.vote_type ?? 'voice')
  const [voteDraft, setVoteDraft] = useState<Record<string, VoteValue | null>>({})

  const voters: VoterRow[] = useMemo(
    () =>
      bundle.attendance.map(p => ({
        person_id: p.person_id,
        name: p.name,
        eligible: p.status !== 'absent',
        default_vote: p.status === 'absent' ? 'absent' : 'yea',
      })),
    [bundle.attendance],
  )

  const tally = tallyFromActiveMotion(active)
  const showTally = !!tally && ['passed', 'failed', 'voting'].includes(active.status)

  return (
    <MotionScreenFrame {...props} active={active}>
      <HeldMotionCard label="Main motion (held)" motionText={parent.text ?? ''} />
      <div className="cs-card">
        <p className="cs-eyebrow">Substitute motion — voting</p>
        <VoteGrid
          voteMode={voteMode}
          setVoteMode={setVoteMode}
          voters={voters}
          voteDraft={voteDraft}
          onChange={(id, v) => setVoteDraft(d => ({ ...d, [id]: v }))}
          disabled={disabled}
        />
      </div>
      {showTally && tally ? <TallyRow tally={tally} result={active.result ?? null} /> : null}
      <div className="ms-actions">
        <button
          type="button"
          className="cs-touchbtn cs-touchbtn-primary"
          disabled={disabled}
          onClick={async () => {
            const payload = voters.map(v => {
              const vote =
                voteDraft[v.person_id] ??
                (voteMode === 'voice' ? (v.eligible ? 'yea' : 'absent') : null)
              return { person_id: v.person_id, vote: vote || 'absent' }
            })
            if (voteMode === 'roll_call' && payload.some(p => !p.vote)) return
            await onAction('record-vote', { votes: payload })
          }}
        >
          Record substitute vote
        </button>
        <button type="button" className="cs-touchbtn" disabled={disabled || !showTally} onClick={onPushResult}>
          Push result to overlay
        </button>
      </div>
    </MotionScreenFrame>
  )
}
