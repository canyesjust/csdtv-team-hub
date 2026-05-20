'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from '@/lib/toast'
import VoteInterface, { type VoterRow } from './VoteInterface'
import type { VoteMode, VoteValue } from '@/lib/board-meetings/motion-types'
import { resolveSuggestedMotionText } from '@/lib/board-meetings/motion-api'

type AgendaItem = {
  id: string
  title: string
  type: string
  item_number: string
  consent_block?: string | null
  suggested_motion_text?: string | null
}

type Motion = {
  id: string
  motion_text: string
  status: string
  motion_type: string
  parent_motion_id: string | null
  consent_block: string | null
  result: string | null
  moved_by?: { id: string; display_name: string } | null
  seconded_by?: { id: string; display_name: string } | null
}

type AttendanceRecord = { person_id: string; name: string; status: string }

type OpenKind = 'main' | 'substitute' | 'consent'

export default function MotionVotePanel({
  productionId,
  currentItem,
  allItems,
  broadcastState,
  disabled,
  onUpdated,
}: {
  productionId: string
  currentItem: AgendaItem | undefined
  allItems: AgendaItem[]
  broadcastState: {
    active_motion_id?: string | null
    active_vote_result_motion_id?: string | null
    vote_result_started_at?: string | null
    vote_result_duration_seconds?: number | null
  } | null
  disabled?: boolean
  onUpdated: () => void
}) {
  const [motions, setMotions] = useState<Motion[]>([])
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [voteMode, setVoteMode] = useState<VoteMode>('voice')
  const [votingMotionId, setVotingMotionId] = useState<string | null>(null)
  const [voteDraft, setVoteDraft] = useState<Record<string, VoteValue | null>>({})
  const [editStep, setEditStep] = useState<'mover' | 'seconder' | null>(null)

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'

  const load = useCallback(async () => {
    const [mRes, aRes] = await Promise.all([
      fetch(`/api/board-meetings/${productionId}/motions`),
      fetch(`/api/board-meetings/${productionId}/attendance`),
    ])
    const mBody = await mRes.json()
    const aBody = await aRes.json()
    if (mRes.ok) setMotions(mBody.motions || [])
    if (aRes.ok) setAttendance(aBody.records || [])
  }, [productionId])

  useEffect(() => { load() }, [load])

  const activeMotion = useMemo(() => {
    const id = broadcastState?.active_motion_id
    if (!id) return motions.find(m => ['open_for_discussion', 'voting'].includes(m.status))
    return motions.find(m => m.id === id)
  }, [broadcastState?.active_motion_id, motions])

  useEffect(() => {
    if (!activeMotion || votingMotionId) return
    if (activeMotion.status === 'voting') {
      setVotingMotionId(activeMotion.id)
      return
    }
    if (editStep) return
    if (!activeMotion.moved_by) setEditStep('mover')
    else if (!activeMotion.seconded_by) setEditStep('seconder')
  }, [activeMotion, votingMotionId, editStep])

  const consentBlockItems = useMemo(() => {
    if (!currentItem?.consent_block) return []
    return allItems.filter(i => i.consent_block === currentItem.consent_block)
  }, [allItems, currentItem])

  const presentMembers = useMemo(
    () => attendance.filter(p => p.status !== 'absent'),
    [attendance],
  )

  const showPanel = currentItem?.type === 'action' || !!activeMotion

  const motionReady =
    !!activeMotion?.moved_by?.id && !!activeMotion?.seconded_by?.id

  const post = async (path: string, body?: Record<string, unknown>) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/board-meetings/${productionId}/motions/${path}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error || 'Action failed', 'error')
        return false
      }
      if (data.quorum_met_at_vote === false) {
        toast('Quorum may not have been met at time of vote', 'error')
      }
      await load()
      onUpdated()
      return true
    } finally {
      setBusy(false)
    }
  }

  const patchMotion = async (
    motionId: string,
    patch: { motion_text?: string; moved_by_person_id?: string | null; seconded_by_person_id?: string | null },
  ) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/board-meetings/${productionId}/motions/${motionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error || 'Update failed', 'error')
        return false
      }
      setEditStep(null)
      await load()
      onUpdated()
      return true
    } finally {
      setBusy(false)
    }
  }

  const startMotion = async (kind: OpenKind) => {
    let motion_text = currentItem
      ? resolveSuggestedMotionText({
          id: currentItem.id,
          item_number: currentItem.item_number,
          title: currentItem.title,
          type: currentItem.type,
          suggested_motion_text: currentItem.suggested_motion_text,
        })
      : ''
    const body: Record<string, unknown> = {
      motion_type: kind === 'substitute' ? 'substitute' : 'main',
    }
    if (kind === 'substitute' && activeMotion) {
      body.parent_motion_id = activeMotion.id
      motion_text = 'I move to substitute the following motion'
    }
    if (kind === 'consent' && currentItem?.consent_block) {
      body.consent_block = currentItem.consent_block
      motion_text = 'Move to approve the consent agenda as presented'
    } else if (currentItem && kind !== 'consent') {
      body.agenda_item_id = currentItem.id
    }
    body.motion_text = motion_text

    setBusy(true)
    try {
      const res = await fetch(`/api/board-meetings/${productionId}/motions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error || 'Failed to open motion', 'error')
        return
      }
      setEditStep('mover')
      await load()
      onUpdated()
    } finally {
      setBusy(false)
    }
  }

  const pickMover = async (personId: string) => {
    if (!activeMotion) return
    await patchMotion(activeMotion.id, { moved_by_person_id: personId })
    setEditStep('seconder')
  }

  const pickSeconder = async (personId: string) => {
    if (!activeMotion) return
    await patchMotion(activeMotion.id, { seconded_by_person_id: personId })
    setEditStep(null)
  }

  const startVoteUi = async (motionId: string) => {
    const ok = await post(`${motionId}/open-vote`, { vote_mode: voteMode })
    if (ok) {
      setVotingMotionId(motionId)
      setVoteDraft({})
      setEditStep(null)
    }
  }

  const voters: VoterRow[] = attendance.map(p => ({
    person_id: p.person_id,
    name: p.name,
    eligible: p.status !== 'absent',
    default_vote: p.status === 'absent' ? 'absent' : 'yea',
  }))

  const recordVote = async (motionId: string, reRecord = false) => {
    const payload = voters.map(v => {
      const vote =
        voteDraft[v.person_id] ??
        (voteMode === 'voice' ? (v.eligible ? 'yea' : 'absent') : null)
      return { person_id: v.person_id, vote: vote || 'absent' }
    })
    if (voteMode === 'roll_call' && payload.some(p => !p.vote)) {
      toast('Record a vote for each member', 'error')
      return
    }
    if (!window.confirm('Record this vote?')) return
    const path = reRecord ? `${motionId}/re-record-vote` : `${motionId}/record-vote`
    const ok = await post(path, { votes: payload })
    if (ok) setVotingMotionId(null)
  }

  const btn: React.CSSProperties = {
    fontSize: '15px',
    padding: '14px 18px',
    minHeight: '52px',
    borderRadius: '12px',
    border: `0.5px solid ${border}`,
    background: cardBg,
    color: text,
    cursor: busy || disabled ? 'wait' : 'pointer',
    fontFamily: 'inherit',
    fontWeight: 600,
    opacity: busy || disabled ? 0.6 : 1,
  }

  const primaryBtn: React.CSSProperties = { ...btn, background: '#1e6cb5', color: '#fff', border: 'none' }
  const dangerBtn: React.CSSProperties = { ...btn, background: '#8b1a1a', color: '#fff', border: 'none' }

  if (!showPanel) {
    return (
      <section style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '14px' }}>
        <h2 style={{ margin: 0, fontSize: '15px', color: muted }}>Motion &amp; vote</h2>
        <p style={{ margin: '8px 0 0', fontSize: '13px', color: muted }}>Advance to an action item to open motions.</p>
      </section>
    )
  }

  return (
    <section style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '14px' }}>
      <h2 style={{ margin: '0 0 12px', fontSize: '15px', color: text }}>Motion &amp; vote</h2>

      {votingMotionId ? (
        <VoteBlock
          voteMode={voteMode}
          setVoteMode={setVoteMode}
          voters={voters}
          voteDraft={voteDraft}
          setVoteDraft={setVoteDraft}
          busy={busy}
          btn={btn}
          primaryBtn={primaryBtn}
          onRecord={() => recordVote(votingMotionId)}
          onCancel={() => setVotingMotionId(null)}
        />
      ) : activeMotion ? (
        <ActiveMotionBlock
          motion={activeMotion}
          motionReady={motionReady}
          editStep={editStep}
          setEditStep={setEditStep}
          presentMembers={presentMembers}
          disabled={disabled}
          busy={busy}
          btn={btn}
          primaryBtn={primaryBtn}
          dangerBtn={dangerBtn}
          muted={muted}
          border={border}
          text={text}
          onPickMover={pickMover}
          onPickSeconder={pickSeconder}
          onClearMover={async () => {
            if (!activeMotion) return
            const ok = await patchMotion(activeMotion.id, { moved_by_person_id: null, seconded_by_person_id: null })
            if (ok) setEditStep('mover')
          }}
          onClearSeconder={async () => {
            if (!activeMotion) return
            const ok = await patchMotion(activeMotion.id, { seconded_by_person_id: null })
            if (ok) setEditStep('seconder')
          }}
          onOpenVote={() => startVoteUi(activeMotion.id)}
          onSubstitute={() => startMotion('substitute')}
          onWithdraw={() => post(`${activeMotion.id}/withdraw`)}
          onTable={() => post(`${activeMotion.id}/table`)}
        />
      ) : (
        <EmptyMotionBlock
          currentItem={currentItem}
          consentBlockItems={consentBlockItems}
          disabled={disabled}
          busy={busy}
          primaryBtn={primaryBtn}
          muted={muted}
          onOpenMain={() => startMotion('main')}
          onOpenConsent={() => startMotion('consent')}
        />
      )}

      {broadcastState?.active_vote_result_motion_id && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `0.5px solid ${border}` }}>
          <p style={{ margin: '0 0 8px', fontSize: '13px', color: muted }}>Vote result on air</p>
          <button
            type="button"
            style={btn}
            disabled={busy}
            onClick={() => post(`${broadcastState?.active_vote_result_motion_id}/dismiss-result`)}
          >
            Dismiss result
          </button>
        </div>
      )}

      {motions.filter(m => m.status === 'tabled').length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <p style={{ fontSize: '12px', color: muted, margin: '0 0 6px' }}>Tabled motions</p>
          {motions.filter(m => m.status === 'tabled').map(m => (
            <button key={m.id} type="button" style={{ ...btn, width: '100%', marginBottom: '6px' }} disabled={busy} onClick={() => post(`${m.id}/reopen`)}>
              Reopen: {m.motion_text.slice(0, 60)}…
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function ActiveMotionBlock({
  motion,
  motionReady,
  editStep,
  setEditStep,
  presentMembers,
  disabled,
  busy,
  btn,
  primaryBtn,
  dangerBtn,
  muted,
  border,
  text,
  onPickMover,
  onPickSeconder,
  onClearMover,
  onClearSeconder,
  onOpenVote,
  onSubstitute,
  onWithdraw,
  onTable,
}: {
  motion: Motion
  motionReady: boolean
  editStep: 'mover' | 'seconder' | null
  setEditStep: (s: 'mover' | 'seconder' | null) => void
  presentMembers: AttendanceRecord[]
  disabled?: boolean
  busy: boolean
  btn: React.CSSProperties
  primaryBtn: React.CSSProperties
  dangerBtn: React.CSSProperties
  muted: string
  border: string
  text: string
  onPickMover: (id: string) => void
  onPickSeconder: (id: string) => void
  onClearMover: () => void
  onClearSeconder: () => void
  onOpenVote: () => void
  onSubstitute: () => void
  onWithdraw: () => void
  onTable: () => void
}) {
  const isVoting = motion.status === 'voting'
  const hasMover = !!motion.moved_by
  const hasSeconder = !!motion.seconded_by
  const showMoverGrid = !hasMover || editStep === 'mover'
  const showSeconderGrid = hasMover && (!hasSeconder || editStep === 'seconder')

  let stepLabel = 'Tap who made the motion'
  if (isVoting) stepLabel = 'Voting is open on the dais'
  else if (hasMover && !hasSeconder) stepLabel = 'Tap who seconded'
  else if (motionReady) stepLabel = 'Motion ready — open vote when ready'
  else if (!hasMover) stepLabel = 'Motion opened — tap who made it'

  return (
    <div>
      <p style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 700, color: isVoting ? '#1e6cb5' : '#e8a020' }}>
        {stepLabel}
      </p>

      {hasMover && !showMoverGrid && (
        <div style={{ marginBottom: '10px', padding: '12px', borderRadius: '10px', background: 'var(--surface-2)', border: `0.5px solid ${border}` }}>
          <p style={{ margin: 0, fontSize: '12px', color: muted }}>Moved by</p>
          <p style={{ margin: '4px 0 8px', fontSize: '18px', fontWeight: 700, color: text }}>{motion.moved_by!.display_name}</p>
          {!isVoting && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" style={btn} disabled={busy || disabled} onClick={() => setEditStep('mover')}>Change</button>
              <button type="button" style={btn} disabled={busy || disabled} onClick={onClearMover}>Remove</button>
            </div>
          )}
        </div>
      )}

      {hasMover && hasSeconder && !showSeconderGrid && (
        <div style={{ marginBottom: '10px', padding: '12px', borderRadius: '10px', background: 'var(--surface-2)', border: `0.5px solid ${border}` }}>
          <p style={{ margin: 0, fontSize: '12px', color: muted }}>Seconded by</p>
          <p style={{ margin: '4px 0 8px', fontSize: '18px', fontWeight: 700, color: text }}>{motion.seconded_by!.display_name}</p>
          {!isVoting && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" style={btn} disabled={busy || disabled} onClick={() => setEditStep('seconder')}>Change</button>
              <button type="button" style={btn} disabled={busy || disabled} onClick={onClearSeconder}>Remove</button>
            </div>
          )}
        </div>
      )}

      {hasMover && (
        <div style={{ marginBottom: '12px', padding: '12px', borderRadius: '10px', border: `0.5px solid ${border}` }}>
          <p style={{ margin: 0, fontSize: '12px', color: muted }}>Motion</p>
          <p style={{ margin: '6px 0 0', fontSize: '16px', lineHeight: 1.4, color: text }}>{motion.motion_text}</p>
        </div>
      )}

      {showMoverGrid && !isVoting && (
        <PersonTapGrid
          label="Who made the motion?"
          members={presentMembers}
          disabled={busy || disabled}
          onSelect={onPickMover}
        />
      )}

      {showSeconderGrid && !isVoting && (
        <PersonTapGrid
          label="Who seconded?"
          members={presentMembers}
          excludeId={motion.moved_by?.id}
          disabled={busy || disabled}
          onSelect={onPickSeconder}
        />
      )}

      {motionReady && !isVoting && editStep === null && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
          <button type="button" style={primaryBtn} disabled={disabled || busy} onClick={onOpenVote}>
            Open vote
          </button>
          {motion.motion_type === 'main' && (
            <button type="button" style={btn} disabled={disabled || busy} onClick={onSubstitute}>
              Substitute
            </button>
          )}
          <button type="button" style={btn} disabled={disabled || busy} onClick={onWithdraw}>Withdraw</button>
          <button type="button" style={btn} disabled={disabled || busy} onClick={onTable}>Table</button>
        </div>
      )}

    </div>
  )
}

function PersonTapGrid({
  label,
  members,
  excludeId,
  disabled,
  onSelect,
}: {
  label: string
  members: AttendanceRecord[]
  excludeId?: string
  disabled?: boolean
  onSelect: (personId: string) => void
}) {
  const filtered = excludeId ? members.filter(m => m.person_id !== excludeId) : members
  const border = 'var(--border-subtle)'
  const text = 'var(--text-primary)'

  return (
    <div style={{ marginBottom: '12px' }}>
      <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>{label}</p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
          gap: '10px',
        }}
      >
        {filtered.map(m => (
          <button
            key={m.person_id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(m.person_id)}
            style={{
              minHeight: '56px',
              padding: '12px 14px',
              borderRadius: '12px',
              border: `0.5px solid ${border}`,
              background: 'var(--surface-2)',
              color: text,
              fontSize: '16px',
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: disabled ? 'wait' : 'pointer',
              textAlign: 'center',
              lineHeight: 1.2,
            }}
          >
            {m.name}
          </button>
        ))}
      </div>
    </div>
  )
}

function EmptyMotionBlock({
  currentItem,
  consentBlockItems,
  disabled,
  busy,
  primaryBtn,
  muted,
  onOpenMain,
  onOpenConsent,
}: {
  currentItem?: AgendaItem
  consentBlockItems: AgendaItem[]
  disabled?: boolean
  busy: boolean
  primaryBtn: React.CSSProperties
  muted: string
  onOpenMain: () => void
  onOpenConsent: () => void
}) {
  const isFirstInConsent =
    currentItem?.consent_block &&
    consentBlockItems[0]?.id === currentItem.id

  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: '14px', color: muted }}>No motion on floor</p>
      <button type="button" style={{ ...primaryBtn, width: '100%' }} disabled={disabled || busy} onClick={onOpenMain}>
        Open motion
      </button>
      {isFirstInConsent && consentBlockItems.length > 1 && (
        <div style={{ marginTop: '12px' }}>
          <p style={{ fontSize: '13px', color: muted, margin: '0 0 8px' }}>
            Consent block ({consentBlockItems[0].item_number} – {consentBlockItems[consentBlockItems.length - 1].item_number})
          </p>
          <button type="button" style={{ ...primaryBtn, width: '100%' }} disabled={disabled || busy} onClick={onOpenConsent}>
            Open consent motion
          </button>
        </div>
      )}
    </div>
  )
}

function VoteBlock({
  voteMode,
  setVoteMode,
  voters,
  voteDraft,
  setVoteDraft,
  busy,
  btn,
  primaryBtn,
  onRecord,
  onCancel,
}: {
  voteMode: VoteMode
  setVoteMode: (m: VoteMode) => void
  voters: VoterRow[]
  voteDraft: Record<string, VoteValue | null>
  setVoteDraft: React.Dispatch<React.SetStateAction<Record<string, VoteValue | null>>>
  busy: boolean
  btn: React.CSSProperties
  primaryBtn: React.CSSProperties
  onRecord: () => void
  onCancel: () => void
}) {
  const cardBg = 'var(--surface-1)'
  const text = 'var(--text-primary)'

  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, color: '#1e6cb5' }}>Voting open on dais</p>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button
          type="button"
          style={{ ...btn, flex: 1, background: voteMode === 'voice' ? '#1e6cb5' : cardBg, color: voteMode === 'voice' ? '#fff' : text }}
          onClick={() => setVoteMode('voice')}
        >
          Voice
        </button>
        <button
          type="button"
          style={{ ...btn, flex: 1, background: voteMode === 'roll_call' ? '#1e6cb5' : cardBg, color: voteMode === 'roll_call' ? '#fff' : text }}
          onClick={() => setVoteMode('roll_call')}
        >
          Roll call
        </button>
      </div>
      <VoteInterface mode={voteMode} voters={voters} votes={voteDraft} onChange={(id, v) => setVoteDraft(d => ({ ...d, [id]: v }))} />
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button type="button" style={{ ...primaryBtn, flex: 1, background: '#166534' }} disabled={busy} onClick={onRecord}>
          Record vote
        </button>
        <button type="button" style={{ ...btn, flex: 1 }} disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
