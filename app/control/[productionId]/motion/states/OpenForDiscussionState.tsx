'use client'

import MemberPickerGrid, { type MemberOption } from '../components/MemberPickerGrid'
import MotionTextCard from '../components/MotionTextCard'

export default function OpenForDiscussionState({
  motionText,
  setMotionText,
  members,
  hasMover,
  hasSeconder,
  moverPersonId,
  moverName,
  seconderName,
  editStep,
  setEditStep,
  disabled,
  busy,
  onSaveText,
  onPickMover,
  onPickSeconder,
  onOpenVote,
  onProposeSubstitute,
  onWithdraw,
  showSubstituteButton,
}: {
  motionText: string
  setMotionText: (v: string) => void
  members: MemberOption[]
  hasMover: boolean
  hasSeconder: boolean
  moverPersonId: string | null
  moverName: string | null
  seconderName: string | null
  editStep: 'mover' | 'seconder' | null
  setEditStep: (s: 'mover' | 'seconder' | null) => void
  disabled?: boolean
  busy?: boolean
  onSaveText: () => void
  onPickMover: (id: string) => void
  onPickSeconder: (id: string) => void
  onOpenVote: () => void
  onProposeSubstitute: () => void
  onWithdraw: () => void
  showSubstituteButton?: boolean
}) {
  const showMoverGrid = !hasMover || editStep === 'mover'
  const showSeconderGrid = hasMover && (!hasSeconder || editStep === 'seconder')
  const ready = hasMover && hasSeconder

  return (
    <>
      <MotionTextCard text={motionText} disabled={disabled || busy} onChange={setMotionText} onSave={onSaveText} />

      {hasMover && !showMoverGrid ? (
        <div className="cs-card">
          <p className="cs-eyebrow">Moved by</p>
          <p style={{ margin: '6px 0 8px', fontSize: 18, fontWeight: 700 }}>{moverName}</p>
          <button type="button" className="cs-touchbtn" disabled={disabled || busy} onClick={() => setEditStep('mover')}>
            Change mover
          </button>
        </div>
      ) : null}

      {hasMover && hasSeconder && !showSeconderGrid ? (
        <div className="cs-card">
          <p className="cs-eyebrow">Seconded by</p>
          <p style={{ margin: '6px 0 8px', fontSize: 18, fontWeight: 700 }}>{seconderName}</p>
          <button type="button" className="cs-touchbtn" disabled={disabled || busy} onClick={() => setEditStep('seconder')}>
            Change seconder
          </button>
        </div>
      ) : null}

      {showMoverGrid ? (
        <MemberPickerGrid label="Who made the motion?" members={members} disabled={disabled || busy} onSelect={onPickMover} />
      ) : null}

      {showSeconderGrid ? (
        <MemberPickerGrid
          label="Who seconded?"
          members={members}
          excludeId={moverPersonId || undefined}
          disabled={disabled || busy}
          onSelect={onPickSeconder}
        />
      ) : null}

      {ready && editStep === null ? (
        <div className="ms-actions">
          <button type="button" className="cs-touchbtn cs-touchbtn-primary" disabled={disabled || busy} onClick={onOpenVote}>
            Open vote
          </button>
          {showSubstituteButton ? (
            <button type="button" className="cs-touchbtn" disabled={disabled || busy} onClick={onProposeSubstitute}>
              Propose substitute
            </button>
          ) : null}
          <button type="button" className="cs-touchbtn cs-touchbtn-danger" disabled={disabled || busy} onClick={onWithdraw}>
            Withdraw
          </button>
        </div>
      ) : null}
    </>
  )
}
