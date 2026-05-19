'use client'

import Link from 'next/link'
import MotionContextBar from './components/MotionContextBar'
import DraftingState from './states/DraftingState'
import OpenForDiscussionState from './states/OpenForDiscussionState'
import SubstituteVotingState from './states/SubstituteVotingState'
import VotingState from './states/VotingState'
import type { MotionScreenModel } from './motion-screen-types'

export default function MotionScreenView({
  productionId,
  model,
  disabled,
  busy,
  motionText,
  setMotionText,
  voteMode,
  setVoteMode,
  voteDraft,
  setVoteDraft,
  editStep,
  setEditStep,
  recordedTally,
  recordedResult,
  onSaveText,
  onPickMover,
  onPickSeconder,
  onOpenVote,
  onProposeSubstitute,
  onWithdraw,
  onOpenMain,
  onOpenConsent,
  onRecordVote,
  onPushResult,
}: {
  productionId: string
  model: MotionScreenModel
  disabled?: boolean
  busy?: boolean
  motionText: string
  setMotionText: (v: string) => void
  voteMode: 'voice' | 'roll_call'
  setVoteMode: (m: 'voice' | 'roll_call') => void
  voteDraft: Record<string, import('@/lib/board-meetings/motion-types').VoteValue | null>
  setVoteDraft: React.Dispatch<React.SetStateAction<Record<string, import('@/lib/board-meetings/motion-types').VoteValue | null>>>
  editStep: 'mover' | 'seconder' | null
  setEditStep: (s: 'mover' | 'seconder' | null) => void
  recordedTally: import('@/lib/board-meetings/motion-types').VoteTally | null
  recordedResult: string | null
  onSaveText: () => void
  onPickMover: (id: string) => void
  onPickSeconder: (id: string) => void
  onOpenVote: () => void
  onProposeSubstitute: () => void
  onWithdraw: () => void
  onOpenMain: () => void
  onOpenConsent: () => void
  onRecordVote: () => void
  onPushResult: () => void
}) {
  const { activeMotion, parentMotion, currentItem, members, voters, statusLabel, resultOnOverlay } = model
  const inVotePhase =
    !!activeMotion &&
    (activeMotion.status === 'voting' ||
      (['passed', 'failed'].includes(activeMotion.status) && !resultOnOverlay))

  return (
  <>
    <header className="ms-topbar">
      <h1 className="ms-topbar__title">Motion &amp; vote</h1>
      <div className="ms-topbar__actions">
        <Link href={`/control/${productionId}`} className="cs-touchbtn">
          Minimize
        </Link>
      </div>
    </header>

    <MotionContextBar
      productionId={productionId}
      itemLabel={currentItem ? `${currentItem.item_number} ${currentItem.title}` : null}
      statusLabel={statusLabel}
    />

    <div className="ms-body">
      {!activeMotion ? (
        <DraftingState
          currentTitle={currentItem?.title ?? null}
          isConsentLead={model.isConsentLead}
          consentRange={model.consentRange}
          disabled={disabled}
          busy={busy}
          onOpenMain={onOpenMain}
          onOpenConsent={onOpenConsent}
        />
      ) : inVotePhase && activeMotion.motion_type === 'substitute' && parentMotion ? (
        <SubstituteVotingState
          parentMotionText={parentMotion.motion_text}
          voteMode={voteMode}
          setVoteMode={setVoteMode}
          voters={voters}
          voteDraft={voteDraft}
          onVoteChange={(id, v) => setVoteDraft(d => ({ ...d, [id]: v }))}
          tally={recordedTally}
          result={recordedResult}
          showTally={!!recordedTally}
          disabled={disabled}
          busy={busy}
          onRecordVote={onRecordVote}
          onPushResult={onPushResult}
        />
      ) : inVotePhase ? (
        <VotingState
          voteMode={voteMode}
          setVoteMode={setVoteMode}
          voters={voters}
          voteDraft={voteDraft}
          onVoteChange={(id, v) => setVoteDraft(d => ({ ...d, [id]: v }))}
          tally={recordedTally}
          result={recordedResult}
          showTally={!!recordedTally}
          disabled={disabled}
          busy={busy}
          onRecordVote={onRecordVote}
          onPushResult={onPushResult}
        />
      ) : (
        <OpenForDiscussionState
          motionText={motionText}
          setMotionText={setMotionText}
          members={members}
          hasMover={!!activeMotion.moved_by}
          hasSeconder={!!activeMotion.seconded_by}
          moverPersonId={activeMotion.moved_by?.id ?? null}
          moverName={activeMotion.moved_by?.display_name ?? null}
          seconderName={activeMotion.seconded_by?.display_name ?? null}
          editStep={editStep}
          setEditStep={setEditStep}
          disabled={disabled}
          busy={busy}
          onSaveText={onSaveText}
          onPickMover={onPickMover}
          onPickSeconder={onPickSeconder}
          onOpenVote={onOpenVote}
          onProposeSubstitute={onProposeSubstitute}
          onWithdraw={onWithdraw}
          showSubstituteButton={activeMotion.motion_type === 'main'}
        />
      )}
    </div>
  </>
  )
}
