'use client'

import { useState } from 'react'
import MotionTopBar from '../components/MotionTopBar'
import MotionContextBar from '../components/MotionContextBar'
import MotionTextCard from '../components/MotionTextCard'
import MemberPickerGrid from '../components/MemberPickerGrid'
import type { MotionScreenBundle, ActiveMotion } from '@/lib/board-meetings/types'

type Props = {
  bundle: MotionScreenBundle
  active: ActiveMotion | null
  busy: boolean
  error: string | null
  onAction: (action: string, body?: unknown) => Promise<void>
  onMinimize: () => void
}

export default function DraftingState({ bundle, active, busy, error, onAction, onMinimize }: Props) {
  const [pickingFor, setPickingFor] = useState<'mover' | 'seconder'>(
    active?.mover_id ? 'seconder' : 'mover',
  )

  const moverId = active?.mover_id
  const seconderId = active?.seconder_id
  const canAdvance = !!(moverId && seconderId)

  const hint = pickingFor === 'mover' ? 'SELECT MOVER · TAP A MEMBER' : 'SELECT SECONDER · TAP A MEMBER'

  const onPickMember = async (personId: string) => {
    if (!active) {
      await onAction('open', { agenda_item_id: bundle.current_agenda_item_id, mover_id: personId })
      setPickingFor('seconder')
      return
    }
    if (pickingFor === 'mover') {
      await onAction('set-mover', { person_id: personId })
      setPickingFor('seconder')
    } else {
      await onAction('set-seconder', { person_id: personId })
    }
  }

  const onAdvanceToDiscussion = () => onAction('open-discussion')
  const onCancel = () => onAction('withdraw')

  return (
    <div className="motion-screen">
      <MotionTopBar onMinimize={onMinimize} liveElapsed={bundle.live_elapsed} />

      <MotionContextBar
        agendaItem={bundle.current_agenda_item}
        statusPill={{ label: 'DRAFTING', variant: 'info', icon: 'pencil' }}
      />

      <div className="ms-body">
        <MotionTextCard
          text={active?.text || bundle.suggested_motion_text}
          moverName={getMemberName(bundle, active?.mover_id)}
          seconderName={getMemberName(bundle, active?.seconder_id)}
          voteType={active?.vote_type || 'voice'}
          readonly={!active}
          onEditText={active ? txt => onAction('set-text', { text: txt }) : undefined}
          onChangeVoteType={active ? t => onAction('set-vote-type', { vote_type: t }) : undefined}
          onClearMover={
            active
              ? () => {
                  onAction('set-mover', { person_id: null })
                  setPickingFor('mover')
                }
              : undefined
          }
          onClearSeconder={
            active
              ? () => {
                  onAction('set-seconder', { person_id: null })
                  setPickingFor('seconder')
                }
              : undefined
          }
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--semantic-warning-text)',
              letterSpacing: '0.05em',
              fontWeight: 500,
            }}
          >
            {hint}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {bundle.voting_members.length} board members
            {moverId ? ` · ${getMemberName(bundle, moverId)} is mover` : ''}
          </div>
        </div>

        <MemberPickerGrid
          members={bundle.voting_members}
          moverId={moverId}
          seconderId={seconderId}
          onPick={onPickMember}
        />
      </div>

      <div className="ms-actions">
        <button
          type="button"
          className={'cs-touchbtn ' + (canAdvance ? 'cs-touchbtn-primary' : '')}
          onClick={onAdvanceToDiscussion}
          disabled={!canAdvance || busy}
        >
          Open for discussion →
        </button>
        {active && (
          <button type="button" className="cs-touchbtn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        {!canAdvance && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
            {!moverId ? 'Need a mover to continue' : 'Need a seconder to continue'}
          </span>
        )}
        {error && <span style={{ color: 'var(--semantic-danger-text)', fontSize: 12 }}>{error}</span>}
      </div>
    </div>
  )
}

function getMemberName(bundle: MotionScreenBundle, id: string | null | undefined): string | null {
  if (!id) return null
  return bundle.voting_members.find(m => m.id === id)?.display_name || null
}
