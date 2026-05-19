'use client'

import MotionTopBar from '../components/MotionTopBar'
import MotionContextBar from '../components/MotionContextBar'
import MotionTextCard from '../components/MotionTextCard'
import VoteGrid from '../components/VoteGrid'
import TallyRow from '../components/TallyRow'
<<<<<<< HEAD
import type { MotionScreenBundle, ActiveMotion } from '@/lib/board-meetings/types'
=======
import type { MotionScreenBundle, ActiveMotion } from '@/lib/board-meetings/motion-types'
>>>>>>> 33c0c41 (Control surface and motion screen redesign)

type Props = {
  bundle: MotionScreenBundle
  active: ActiveMotion
  busy: boolean
  error: string | null
  onAction: (action: string, body?: unknown) => Promise<void>
  onMinimize: () => void
  onPushResult: () => Promise<void>
}

<<<<<<< HEAD
export default function VotingState({
  bundle,
  active,
  busy,
  error,
  onAction,
  onMinimize,
  onPushResult,
}: Props) {
  const tally = bundle.tally
  const isVoice = active.vote_type === 'voice'
  const willPass = tally.yea > tally.nay && tally.yea >= (bundle.quorum_size || 4)

  const onRecordVote = (
    personId: string,
    vote: 'yea' | 'nay' | 'abstain' | 'absent' | 'recused',
  ) => onAction('record-vote', { person_id: personId, vote })

  const onSubstitute = () =>
    onAction('propose-substitute', { agenda_item_id: bundle.current_agenda_item_id })
  const onCancel = () => onAction('withdraw')

  return (
    <div className="motion-screen">
=======
export default function VotingState({ bundle, active, busy, error, onAction, onMinimize, onPushResult }: Props) {
  const tally = bundle.tally
  const isVoice = active.vote_type === 'voice'
  const majorityNeeded = Math.floor(bundle.voting_members.length / 2) + 1
  const willPass = tally.yea > tally.nay && tally.yea >= majorityNeeded

  const onRecordVote = (personId: string, vote: 'yea' | 'nay' | 'abstain' | 'absent' | 'recused') =>
    onAction('record-vote', { person_id: personId, vote })

  return (
    <div className="motion-screen">

>>>>>>> 33c0c41 (Control surface and motion screen redesign)
      <MotionTopBar onMinimize={onMinimize} liveElapsed={bundle.live_elapsed} />

      <MotionContextBar
        agendaItem={bundle.current_agenda_item}
<<<<<<< HEAD
        statusPill={{ label: 'VOTING IN PROGRESS', variant: 'warning', icon: 'circle-check' }}
      />

      <div className="ms-body">
=======
        statusPill={{ label: 'VOTING IN PROGRESS', variant: 'warning' }}
      />

      <div className="ms-body">

>>>>>>> 33c0c41 (Control surface and motion screen redesign)
        <MotionTextCard
          text={active.text}
          moverName={active.mover_name}
          seconderName={active.seconder_name}
          voteType={active.vote_type}
<<<<<<< HEAD
          onChangeVoteType={t => onAction('set-vote-type', { vote_type: t })}
          onEditText={t => onAction('set-text', { text: t })}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            VOTES · TAP A CARD TO CHANGE
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
=======
          onChangeVoteType={(t) => onAction('set-vote-type', { vote_type: t })}
          onEditText={(t) => onAction('set-text', { text: t })}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #6b7385)', letterSpacing: '0.05em' }}>
            VOTES · TAP A CARD TO CHANGE
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #6b7385)' }}>
>>>>>>> 33c0c41 (Control surface and motion screen redesign)
            {isVoice ? 'Voice vote: all present default to yea' : 'Roll call: tap each member'}
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
<<<<<<< HEAD
          quorumNote={`simple majority · ${Math.floor(bundle.voting_members.length / 2 + 1)} needed`}
        />
=======
          quorumNote={`simple majority · ${majorityNeeded} needed`}
        />

>>>>>>> 33c0c41 (Control surface and motion screen redesign)
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
<<<<<<< HEAD
        <button type="button" className="cs-touchbtn" onClick={onSubstitute} disabled={busy}>
          Substitute motion
        </button>
        <button type="button" className="cs-touchbtn" onClick={onCancel} disabled={busy}>
          Cancel motion
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
=======
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
>>>>>>> 33c0c41 (Control surface and motion screen redesign)
          Result shows on overlay for 8s then auto-dismisses
        </span>
        {error && <span style={{ color: 'var(--semantic-danger-text)', fontSize: 12 }}>{error}</span>}
      </div>
<<<<<<< HEAD
=======

>>>>>>> 33c0c41 (Control surface and motion screen redesign)
    </div>
  )
}
