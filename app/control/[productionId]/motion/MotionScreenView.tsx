'use client'

import { useEffect, useMemo, useState } from 'react'
import type { VoteMode, VoteValue, VoteTally } from '@/lib/board-meetings/motion-types'
import type { MotionScreenBundle } from '@/lib/board-meetings/types'
import type { VoterRow } from '@/app/dashboard/board-meetings/[productionId]/control/components/VoteInterface'
import MotionContextBar from './components/MotionContextBar'
import DraftingState from './states/DraftingState'
import OpenForDiscussionState from './states/OpenForDiscussionState'
import SubstituteVotingState from './states/SubstituteVotingState'
import VotingState from './states/VotingState'

type Props = {
  bundle: MotionScreenBundle
  busy: boolean
  error: string | null
  onAction: (action: string, body?: unknown) => Promise<void>
  onMinimize: () => void
  onPushResult: () => void
}

export default function MotionScreenView({
  bundle,
  busy,
  error,
  onAction,
  onMinimize,
  onPushResult,
}: Props) {
  const active = bundle.active_motion
  const parent = bundle.parent_motion
  const currentItem = bundle.current_agenda_item
  const disabled = !bundle.can_control || !bundle.is_live || busy

  const [motionText, setMotionText] = useState(active?.text ?? '')
  const [voteMode, setVoteMode] = useState<VoteMode>(active?.vote_type ?? 'voice')
  const [voteDraft, setVoteDraft] = useState<Record<string, VoteValue | null>>({})
  const [editStep, setEditStep] = useState<'mover' | 'seconder' | null>(null)

  useEffect(() => {
    setMotionText(active?.text ?? '')
    setVoteMode(active?.vote_type ?? 'voice')
  }, [active?.id, active?.text, active?.vote_type])

  useEffect(() => {
    if (!active) {
      setEditStep(null)
      return
    }
    if (active.status === 'voting') return
    if (!active.mover_id) setEditStep('mover')
    else if (!active.seconder_id) setEditStep('seconder')
    else setEditStep(null)
  }, [active?.id, active?.mover_id, active?.seconder_id, active?.status])

  const members = useMemo(
    () => bundle.attendance.filter(p => p.status !== 'absent').map(p => ({ person_id: p.person_id, name: p.name })),
    [bundle.attendance],
  )

  const voters: VoterRow[] = useMemo(
    () =>
      bundle.attendance.map(p => ({
        person_id: p.person_id,
        name: p.name,
        eligible: p.status !== 'absent',
        default_vote: p.status === 'absent' ? 'absent' : 'yea',
      })),
    [bundle.attendance],
  )

  const recordedTally: VoteTally | null = useMemo(() => {
    if (!active || active.tally_yea == null && active.tally_nay == null) return null
    return {
      yea: active.tally_yea ?? 0,
      nay: active.tally_nay ?? 0,
      abstain: active.tally_abstain ?? 0,
      absent: 0,
      recused: 0,
    }
  }, [active])

  const statusLabel = active?.status.replace(/_/g, ' ') ?? 'No motion'
  const inVotePhase =
    !!active &&
    (active.status === 'voting' ||
      (['passed', 'failed'].includes(active.status) && !bundle.result_on_overlay))

  const productionId = bundle.meeting.production_id

  return (
    <>
      <header className="ms-topbar">
        <h1 className="ms-topbar__title">Motion &amp; vote</h1>
        <div className="ms-topbar__actions">
          <button type="button" className="cs-touchbtn" onClick={onMinimize}>
            Minimize
          </button>
        </div>
      </header>

      {error ? (
        <p className="control-banner" style={{ margin: '8px 12px 0' }} role="alert">
          {error}
        </p>
      ) : null}

      <MotionContextBar
        productionId={productionId}
        itemLabel={currentItem ? `${currentItem.item_number} ${currentItem.title}` : null}
        statusLabel={statusLabel}
      />

      <div className="ms-body">
        {!active ? (
          <DraftingState
            currentTitle={currentItem?.title ?? null}
            isConsentLead={bundle.consent_is_lead}
            consentRange={bundle.consent_range}
            disabled={disabled}
            busy={busy}
            onOpenMain={() => {
              if (!currentItem) return
              void onAction('open', {
                motion_type: 'main',
                agenda_item_id: currentItem.id,
                motion_text: `Move to approve ${currentItem.title}`,
              })
            }}
            onOpenConsent={() => {
              if (!currentItem?.consent_block) return
              void onAction('open', {
                motion_type: 'main',
                consent_block: currentItem.consent_block,
                motion_text: 'Move to approve the consent agenda as presented',
              })
            }}
          />
        ) : inVotePhase && active.motion_type === 'substitute' && parent ? (
          <SubstituteVotingState
            parentMotionText={parent.text ?? ''}
            voteMode={voteMode}
            setVoteMode={setVoteMode}
            voters={voters}
            voteDraft={voteDraft}
            onVoteChange={(id, v) => setVoteDraft(d => ({ ...d, [id]: v }))}
            tally={recordedTally}
            result={active.result ?? null}
            showTally={!!recordedTally}
            disabled={disabled}
            busy={busy}
            onRecordVote={async () => {
              const payload = voters.map(v => {
                const vote =
                  voteDraft[v.person_id] ??
                  (voteMode === 'voice' ? (v.eligible ? 'yea' : 'absent') : null)
                return { person_id: v.person_id, vote: vote || 'absent' }
              })
              if (voteMode === 'roll_call' && payload.some(p => !p.vote)) return
              await onAction('record-vote', { votes: payload })
            }}
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
            result={active.result ?? null}
            showTally={!!recordedTally}
            disabled={disabled}
            busy={busy}
            onRecordVote={async () => {
              const payload = voters.map(v => {
                const vote =
                  voteDraft[v.person_id] ??
                  (voteMode === 'voice' ? (v.eligible ? 'yea' : 'absent') : null)
                return { person_id: v.person_id, vote: vote || 'absent' }
              })
              if (voteMode === 'roll_call' && payload.some(p => !p.vote)) return
              await onAction('record-vote', { votes: payload })
            }}
            onPushResult={onPushResult}
          />
        ) : (
          <OpenForDiscussionState
            motionText={motionText}
            setMotionText={setMotionText}
            members={members}
            hasMover={!!active.mover_id}
            hasSeconder={!!active.seconder_id}
            moverPersonId={active.mover_id}
            moverName={active.mover_name}
            seconderName={active.seconder_name}
            editStep={editStep}
            setEditStep={setEditStep}
            disabled={disabled}
            busy={busy}
            onSaveText={() => onAction('set-text', { motion_text: motionText })}
            onPickMover={async id => {
              await onAction('set-mover', { person_id: id })
              setEditStep('seconder')
            }}
            onPickSeconder={async id => {
              await onAction('set-seconder', { person_id: id })
              setEditStep(null)
            }}
            onOpenVote={async () => {
              await onAction('set-vote-type', { vote_mode: voteMode })
              await onAction('open-vote', { vote_mode: voteMode })
              setVoteDraft({})
            }}
            onProposeSubstitute={() => onAction('propose-substitute', {})}
            onWithdraw={async () => {
              await onAction('withdraw')
              onMinimize()
            }}
            showSubstituteButton={active.motion_type === 'main'}
          />
        )}
      </div>
    </>
  )
}
