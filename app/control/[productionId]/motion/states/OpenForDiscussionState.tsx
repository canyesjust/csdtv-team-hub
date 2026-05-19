'use client'

import MotionTopBar from '../components/MotionTopBar'
import MotionContextBar from '../components/MotionContextBar'
import MotionTextCard from '../components/MotionTextCard'
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
}

export default function OpenForDiscussionState({ bundle, active, busy, error, onAction, onMinimize }: Props) {
<<<<<<< HEAD
  const onOpenVote = () => onAction('open-vote')
  const onProposeSubstitute = () =>
    onAction('propose-substitute', { agenda_item_id: bundle.current_agenda_item_id })
  const onWithdraw = () => onAction('withdraw')

  return (
    <div className="motion-screen">
=======
  return (
    <div className="motion-screen">

>>>>>>> 33c0c41 (Control surface and motion screen redesign)
      <MotionTopBar onMinimize={onMinimize} liveElapsed={bundle.live_elapsed} />

      <MotionContextBar
        agendaItem={bundle.current_agenda_item}
<<<<<<< HEAD
        statusPill={{ label: 'OPEN FOR DISCUSSION', variant: 'info', icon: 'message-circle' }}
      />

      <div className="ms-body">
=======
        statusPill={{ label: 'OPEN FOR DISCUSSION', variant: 'info' }}
      />

      <div className="ms-body">

>>>>>>> 33c0c41 (Control surface and motion screen redesign)
        <MotionTextCard
          text={active.text}
          moverName={active.mover_name}
          seconderName={active.seconder_name}
          voteType={active.vote_type}
          readonly
        />

<<<<<<< HEAD
        <div
          style={{
            padding: '14px 16px',
            background: 'var(--surface-1)',
            border: '0.5px solid var(--border-subtle)',
            borderRadius: 12,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
            Motion is on the floor.
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Board may discuss, propose a substitute, or move to vote.
          </div>
        </div>
      </div>

      <div className="ms-actions">
        <button type="button" className="cs-touchbtn cs-touchbtn-primary" onClick={onOpenVote} disabled={busy}>
          Open vote →
        </button>
        <button type="button" className="cs-touchbtn" onClick={onProposeSubstitute} disabled={busy}>
          Propose substitute
        </button>
        <button type="button" className="cs-touchbtn" onClick={onWithdraw} disabled={busy}>
=======
        <div style={{
          padding: '14px 16px',
          background: 'var(--surface-1, #131b2e)',
          border: '0.5px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
          borderRadius: 12,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted, #6b7385)', marginBottom: 4 }}>
            Motion is on the floor.
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #6b7385)' }}>
            Board may discuss, propose a substitute, or move to vote.
          </div>
        </div>

      </div>

      <div className="ms-actions">
        <button
          type="button"
          className="cs-touchbtn cs-touchbtn-primary"
          onClick={() => onAction('open-vote')}
          disabled={busy}
        >
          Open vote →
        </button>
        <button
          type="button"
          className="cs-touchbtn"
          onClick={() => onAction('propose-substitute', { agenda_item_id: bundle.current_agenda_item_id })}
          disabled={busy}
        >
          Propose substitute
        </button>
        <button
          type="button"
          className="cs-touchbtn"
          onClick={() => onAction('withdraw')}
          disabled={busy}
        >
>>>>>>> 33c0c41 (Control surface and motion screen redesign)
          Withdraw motion
        </button>
        {error && <span style={{ color: 'var(--semantic-danger-text)', fontSize: 12 }}>{error}</span>}
      </div>
<<<<<<< HEAD
=======

>>>>>>> 33c0c41 (Control surface and motion screen redesign)
    </div>
  )
}
