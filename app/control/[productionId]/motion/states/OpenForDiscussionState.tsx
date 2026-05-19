'use client'

import MotionTopBar from '../components/MotionTopBar'
import MotionContextBar from '../components/MotionContextBar'
import MotionTextCard from '../components/MotionTextCard'
import type { MotionScreenBundle, ActiveMotion } from '@/lib/board-meetings/motion-types'

type Props = {
  bundle: MotionScreenBundle
  active: ActiveMotion
  busy: boolean
  error: string | null
  onAction: (action: string, body?: unknown) => Promise<void>
  onMinimize: () => void
}

export default function OpenForDiscussionState({ bundle, active, busy, error, onAction, onMinimize }: Props) {
  return (
    <div className="motion-screen">

      <MotionTopBar onMinimize={onMinimize} liveElapsed={bundle.live_elapsed} />

      <MotionContextBar
        agendaItem={bundle.current_agenda_item}
        statusPill={{ label: 'OPEN FOR DISCUSSION', variant: 'info' }}
      />

      <div className="ms-body">

        <MotionTextCard
          text={active.text}
          moverName={active.mover_name}
          seconderName={active.seconder_name}
          voteType={active.vote_type}
          readonly
        />

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
          Withdraw motion
        </button>
        {error && <span style={{ color: 'var(--semantic-danger-text)', fontSize: 12 }}>{error}</span>}
      </div>

    </div>
  )
}
