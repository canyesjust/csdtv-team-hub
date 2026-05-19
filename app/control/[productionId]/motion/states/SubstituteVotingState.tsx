'use client'

import MotionTopBar from '../components/MotionTopBar'
import MotionContextBar from '../components/MotionContextBar'
import MotionTextCard from '../components/MotionTextCard'
import HeldMotionCard from '../components/HeldMotionCard'
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
  parent: ActiveMotion
  busy: boolean
  error: string | null
  onAction: (action: string, body?: unknown) => Promise<void>
  onMinimize: () => void
  onPushResult: () => Promise<void>
}

<<<<<<< HEAD
export default function SubstituteVotingState({
  bundle,
  active,
  parent,
  busy,
  error,
  onAction,
  onMinimize,
  onPushResult,
}: Props) {
  const tally = bundle.tally
  const willPass =
    tally.yea > tally.nay && tally.yea >= Math.ceil(bundle.voting_members.length / 2 + 0.5)
  const isTie = tally.yea === tally.nay

  const projection = willPass
    ? 'Substitute passes · main is replaced'
    : isTie
      ? 'Substitute fails · tie · Main returns to floor'
      : 'Substitute fails · Main returns to floor'

  const onRecordVote = (
    personId: string,
    vote: 'yea' | 'nay' | 'abstain' | 'absent' | 'recused',
  ) => onAction('record-vote', { person_id: personId, vote })

  const onWithdrawSub = () => onAction('withdraw')
  const onCancelBoth = () => onAction('cancel-thread')

  return (
    <div className="motion-screen">
=======
export default function SubstituteVotingState({ bundle, active, parent, busy, error, onAction, onMinimize, onPushResult }: Props) {
  const tally = bundle.tally
  const majorityNeeded = Math.floor(bundle.voting_members.length / 2) + 1
  const willPass = tally.yea > tally.nay && tally.yea >= majorityNeeded
  const isTie = tally.yea === tally.nay && (tally.yea > 0 || tally.nay > 0)

  const projection = willPass
    ? 'Substitute passes · main is replaced'
    : (isTie ? 'Substitute fails · tie · Main returns to floor' : 'Substitute fails · Main returns to floor')

  const onRecordVote = (personId: string, vote: 'yea' | 'nay' | 'abstain' | 'absent' | 'recused') =>
    onAction('record-vote', { person_id: personId, vote })

  return (
    <div className="motion-screen">

>>>>>>> 33c0c41 (Control surface and motion screen redesign)
      <MotionTopBar onMinimize={onMinimize} liveElapsed={bundle.live_elapsed} />

      <MotionContextBar
        agendaItem={bundle.current_agenda_item}
<<<<<<< HEAD
        statusPill={{ label: 'VOTING ON SUBSTITUTE', variant: 'warning', icon: 'replace' }}
      />

      <div className="ms-body">
        <HeldMotionCard motion={parent} note="Returns if substitute fails" />

        <div
          style={{
            padding: '14px 16px',
            background: 'var(--surface-1)',
            border: '0.5px solid var(--semantic-warning-border)',
            borderRadius: 12,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: 'var(--semantic-warning-text)',
              letterSpacing: '0.05em',
              fontWeight: 500,
              marginBottom: 6,
            }}
          >
            ⤴ SUBSTITUTE MOTION
=======
        statusPill={{ label: 'VOTING ON SUBSTITUTE', variant: 'warning' }}
      />

      <div className="ms-body">

        <HeldMotionCard motion={parent} note="Returns if substitute fails" />

        <div style={{
          padding: '14px 16px',
          background: 'var(--surface-1, #131b2e)',
          border: '0.5px solid var(--semantic-warning-border)',
          borderRadius: 12,
        }}>
          <div style={{
            fontSize: 11,
            color: 'var(--semantic-warning-text)',
            letterSpacing: '0.05em',
            fontWeight: 500,
            marginBottom: 6,
          }}>
            ↩ SUBSTITUTE MOTION
>>>>>>> 33c0c41 (Control surface and motion screen redesign)
          </div>
          <MotionTextCard
            text={active.text}
            moverName={active.mover_name}
            seconderName={active.seconder_name}
            voteType={active.vote_type}
<<<<<<< HEAD
            onChangeVoteType={t => onAction('set-vote-type', { vote_type: t })}
            onEditText={t => onAction('set-text', { text: t })}
=======
            onChangeVoteType={(t) => onAction('set-vote-type', { vote_type: t })}
            onEditText={(t) => onAction('set-text', { text: t })}
>>>>>>> 33c0c41 (Control surface and motion screen redesign)
            embedded
          />
        </div>

<<<<<<< HEAD
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            VOTES ON SUBSTITUTE · TAP A CARD TO CHANGE
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
=======
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #6b7385)', letterSpacing: '0.05em' }}>
            VOTES ON SUBSTITUTE · TAP A CARD TO CHANGE
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #6b7385)' }}>
>>>>>>> 33c0c41 (Control surface and motion screen redesign)
            {bundle.voting_members.length} voting members
          </div>
        </div>

        <VoteGrid
          members={bundle.voting_members}
          votes={bundle.votes}
          mover={active.mover_id}
          seconder={active.seconder_id}
          parentMover={parent.mover_id}
          parentSeconder={parent.seconder_id}
          onRecordVote={onRecordVote}
        />

        <TallyRow
          yea={tally.yea}
          nay={tally.nay}
          abstain={tally.abstain}
          absent={tally.absent}
          projection={projection}
          projectionVariant={willPass ? 'success' : 'danger'}
<<<<<<< HEAD
          quorumNote={isTie ? 'Tied votes fail without chair break' : ''}
        />
=======
          quorumNote={isTie ? 'Tied votes fail without chair break' : `simple majority · ${majorityNeeded} needed`}
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
        <button type="button" className="cs-touchbtn" onClick={onWithdrawSub} disabled={busy}>
          Withdraw substitute
        </button>
        <button type="button" className="cs-touchbtn cs-touchbtn-danger" onClick={onCancelBoth} disabled={busy}>
          Cancel both motions
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
=======
        <button
          type="button"
          className="cs-touchbtn"
          onClick={() => onAction('withdraw')}
          disabled={busy}
        >
          Withdraw substitute
        </button>
        <button
          type="button"
          className="cs-touchbtn cs-touchbtn-danger"
          onClick={() => onAction('cancel-thread')}
          disabled={busy}
        >
          Cancel both motions
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted, #6b7385)' }}>
>>>>>>> 33c0c41 (Control surface and motion screen redesign)
          Push result → screen closes · overlay 8s · {willPass ? 'main is replaced' : 'main returns'}
        </span>
        {error && <span style={{ color: 'var(--semantic-danger-text)', fontSize: 12 }}>{error}</span>}
      </div>
<<<<<<< HEAD
=======

>>>>>>> 33c0c41 (Control surface and motion screen redesign)
    </div>
  )
}
