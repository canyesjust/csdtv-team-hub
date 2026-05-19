'use client'

import MotionTopBar from '../components/MotionTopBar'
import MotionContextBar from '../components/MotionContextBar'
import MotionTextCard from '../components/MotionTextCard'
import VoteGrid from '../components/VoteGrid'
import TallyRow from '../components/TallyRow'
import type { MotionScreenBundle, ActiveMotion } from '@/lib/board-meetings/motion-types'

type Props = {
  bundle: MotionScreenBundle
  active: ActiveMotion
  busy: boolean
  error: string | null
  onAction: (action: string, body?: unknown) => Promise<void>
  onMinimize: () => void
  onPushResult: () => Promise<void>
}

export default function VotingState({ bundle, active, busy, error, onAction, onMinimize, onPushResult }: Props) {
  const tally = bundle.tally
  const isVoice = active.vote_type === 'voice'
  const majorityNeeded = Math.floor(bundle.voting_members.length / 2) + 1
  const willPass = tally.yea > tally.nay && tally.yea >= majorityNeeded

  const onRecordVote = (personId: string, vote: 'yea' | 'nay' | 'abstain' | 'absent' | 'recused') =>
    onAction('record-vote', { person_id: personId, vote })

  return (
    <div className="motion-screen">

      <MotionTopBar onMinimize={onMinimize} liveElapsed={bundle.live_elapsed} />

      <MotionContextBar
        agendaItem={bundle.current_agenda_item}
        statusPill={{ label: 'VOTING IN PROGRESS', variant: 'warning' }}
      />

      <div className="ms-body">

        <MotionTextCard
          text={active.text}
          moverName={active.mover_name}
          seconderName={active.seconder_name}
          voteType={active.vote_type}
          onChangeVoteType={(t) => onAction('set-vote-type', { vote_type: t })}
          onEditText={(t) => onAction('set-text', { text: t })}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #6b7385)', letterSpacing: '0.05em' }}>
            VOTES · TAP TO CYCLE YEA → NAY → ABSTAIN → ABSENT
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #6b7385)' }}>
            {isVoice ? 'Voice vote: members default to yea' : 'Roll call: tap each member'}
          </div>
        </div>

        <VoteGrid
          members={bundle.voting_members}
          votes={bundle.votes}
          mover={active.mover_id}
          seconder={active.seconder_id}
          onRecordVote={onRecordVote}
        />

        <TallyRow
          yea={tally.yea}
          nay={tally.nay}
          abstain={tally.abstain}
          absent={tally.absent}
          projection={willPass ? 'Motion will pass' : 'Motion will fail'}
          projectionVariant={willPass ? 'success' : 'danger'}
          quorumNote={`simple majority · ${majorityNeeded} needed`}
        />

      </div>

      <div className="ms-actions">
        <button
          type="button"
          className="cs-touchbtn cs-touchbtn-primary"
          onClick={onPushResult}
          disabled={busy}
        >
          Push result to overlay
        </button>
        <button
          type="button"
          className="cs-touchbtn"
          onClick={() => onAction('propose-substitute', { agenda_item_id: bundle.current_agenda_item_id })}
          disabled={busy}
        >
          Substitute motion
        </button>
        <button
          type="button"
          className="cs-touchbtn"
          onClick={() => onAction('withdraw')}
          disabled={busy}
        >
          Cancel motion
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted, #6b7385)' }}>
          Result shows on overlay for 8s then auto-dismisses
        </span>
        {error && <span style={{ color: 'var(--semantic-danger-text)', fontSize: 12 }}>{error}</span>}
      </div>

    </div>
  )
}
