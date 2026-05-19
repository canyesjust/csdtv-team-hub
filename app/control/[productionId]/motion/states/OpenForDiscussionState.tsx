'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ActiveMotion } from '@/lib/board-meetings/types'
import MemberPickerGrid from '../components/MemberPickerGrid'
import MotionScreenFrame from '../components/MotionScreenFrame'
import MotionTextCard from '../components/MotionTextCard'
import type { MotionScreenStateProps } from '../motion-screen-types'

export default function OpenForDiscussionState(
  props: MotionScreenStateProps & { active: ActiveMotion },
) {
  const { bundle, busy, onAction, onMinimize, active } = props
  const disabled = !bundle.can_control || !bundle.is_live || busy

  const [motionText, setMotionText] = useState(active.text ?? '')
  const [editStep, setEditStep] = useState<'mover' | 'seconder' | null>(null)

  useEffect(() => {
    setMotionText(active.text ?? '')
  }, [active.id, active.text])

  useEffect(() => {
    if (!active.mover_id) setEditStep('mover')
    else if (!active.seconder_id) setEditStep('seconder')
    else setEditStep(null)
  }, [active.id, active.mover_id, active.seconder_id])

  const members = useMemo(
    () => bundle.attendance.filter(p => p.status !== 'absent').map(p => ({ person_id: p.person_id, name: p.name })),
    [bundle.attendance],
  )

  const hasMover = !!active.mover_id
  const hasSeconder = !!active.seconder_id
  const showMoverGrid = !hasMover || editStep === 'mover'
  const showSeconderGrid = hasMover && (!hasSeconder || editStep === 'seconder')
  const ready = hasMover && hasSeconder

  return (
    <MotionScreenFrame {...props} active={active}>
      <MotionTextCard
        text={motionText}
        disabled={disabled}
        onChange={setMotionText}
        onSave={() => onAction('set-text', { motion_text: motionText })}
      />

      {hasMover && !showMoverGrid ? (
        <div className="cs-card">
          <p className="cs-eyebrow">Moved by</p>
          <p style={{ margin: '6px 0 8px', fontSize: 18, fontWeight: 700 }}>{active.mover_name}</p>
          <button type="button" className="cs-touchbtn" disabled={disabled} onClick={() => setEditStep('mover')}>
            Change mover
          </button>
        </div>
      ) : null}

      {hasMover && hasSeconder && !showSeconderGrid ? (
        <div className="cs-card">
          <p className="cs-eyebrow">Seconded by</p>
          <p style={{ margin: '6px 0 8px', fontSize: 18, fontWeight: 700 }}>{active.seconder_name}</p>
          <button type="button" className="cs-touchbtn" disabled={disabled} onClick={() => setEditStep('seconder')}>
            Change seconder
          </button>
        </div>
      ) : null}

      {showMoverGrid ? (
        <MemberPickerGrid
          label="Who made the motion?"
          members={members}
          disabled={disabled}
          onSelect={async id => {
            await onAction('set-mover', { person_id: id })
            setEditStep('seconder')
          }}
        />
      ) : null}

      {showSeconderGrid ? (
        <MemberPickerGrid
          label="Who seconded?"
          members={members}
          excludeId={active.mover_id || undefined}
          disabled={disabled}
          onSelect={async id => {
            await onAction('set-seconder', { person_id: id })
            setEditStep(null)
          }}
        />
      ) : null}

      {ready && editStep === null ? (
        <div className="ms-actions">
          <button
            type="button"
            className="cs-touchbtn cs-touchbtn-primary"
            disabled={disabled}
            onClick={async () => {
              await onAction('set-vote-type', { vote_mode: active.vote_type })
              await onAction('open-vote', { vote_mode: active.vote_type })
            }}
          >
            Open vote
          </button>
          {active.motion_type === 'main' ? (
            <button type="button" className="cs-touchbtn" disabled={disabled} onClick={() => onAction('propose-substitute', {})}>
              Propose substitute
            </button>
          ) : null}
          <button
            type="button"
            className="cs-touchbtn cs-touchbtn-danger"
            disabled={disabled}
            onClick={async () => {
              await onAction('withdraw')
              onMinimize()
            }}
          >
            Withdraw
          </button>
        </div>
      ) : null}
    </MotionScreenFrame>
  )
}
