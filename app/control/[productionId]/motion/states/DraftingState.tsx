'use client'

import { useState, useEffect } from 'react'
import MotionTopBar from '../components/MotionTopBar'
import MotionContextBar from '../components/MotionContextBar'
import MotionTextCard from '../components/MotionTextCard'
import MemberPickerGrid from '../components/MemberPickerGrid'
import type { MotionScreenBundle, ActiveMotion } from '@/lib/board-meetings/motion-types'

type Props = {
  bundle: MotionScreenBundle
  active: ActiveMotion | null
  busy: boolean
  error: string | null
  onAction: (action: string, body?: unknown) => Promise<void>
  onMinimize: () => void
}

export default function DraftingState({ bundle, active, busy, error, onAction, onMinimize }: Props) {
  const moverId = active?.mover_id || null
  const seconderId = active?.seconder_id || null

  const [pickingFor, setPickingFor] = useState<'mover' | 'seconder'>(moverId ? 'seconder' : 'mover')

  useEffect(() => {
    if (!moverId) setPickingFor('mover')
    else if (!seconderId) setPickingFor('seconder')
  }, [moverId, seconderId])

  const canAdvance = !!(moverId && seconderId)
  const hint = pickingFor === 'mover'
    ? 'SELECT MOVER · TAP A MEMBER'
    : 'SELECT SECONDER · TAP A MEMBER'

  const onPickMember = (personId: string) => {
    if (!active) {
      setPickingFor('seconder')
      void onAction('open', {
        agenda_item_id: bundle.current_agenda_item_id,
        mover_id: personId,
        motion_text: bundle.suggested_motion_text,
      })
      return
    }
    if (pickingFor === 'mover') {
      setPickingFor('seconder')
      void onAction('set-mover', { person_id: personId })
    } else {
      void onAction('set-seconder', { person_id: personId })
    }
  }

  return (
    <div className="motion-screen">

      <MotionTopBar onMinimize={onMinimize} liveElapsed={bundle.live_elapsed} />

      <MotionContextBar
        agendaItem={bundle.current_agenda_item}
        statusPill={{ label: 'DRAFTING', variant: 'info' }}
      />

      <div className="ms-body">

        <MotionTextCard
          text={active?.text || bundle.suggested_motion_text}
          moverName={getMemberName(bundle, moverId)}
          seconderName={getMemberName(bundle, seconderId)}
          voteType={active?.vote_type || 'voice'}
          onEditText={(txt) => onAction('set-text', { text: txt })}
          onChangeVoteType={(t) => onAction('set-vote-type', { vote_type: t })}
          onClearMover={moverId ? () => onAction('set-mover', { person_id: null }) : undefined}
          onClearSeconder={seconderId ? () => onAction('set-seconder', { person_id: null }) : undefined}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, flexWrap: 'wrap', gap: 6 }}>
          <div style={{
            fontSize: 11,
            color: canAdvance ? 'var(--semantic-success-text)' : 'var(--semantic-warning-text)',
            letterSpacing: '0.05em',
            fontWeight: 500,
          }}>
            {canAdvance ? '✓ READY TO OPEN FOR DISCUSSION' : hint}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #6b7385)' }}>
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
          className={'cs-touchbtn' + (canAdvance ? ' cs-touchbtn-primary' : '')}
          onClick={() => onAction('open-discussion')}
          disabled={!canAdvance || busy}
        >
          Open for discussion →
        </button>
        <button
          type="button"
          className="cs-touchbtn"
          onClick={() => onAction('withdraw')}
          disabled={busy || !active}
        >
          Cancel
        </button>
        {!canAdvance && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted, #6b7385)' }}>
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
