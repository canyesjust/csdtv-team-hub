'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from '@/lib/toast'
import VoteInterface, { type VoterRow } from './VoteInterface'
import type { VoteMode, VoteValue } from '@/lib/board-meetings/motion-types'

type AgendaItem = {
  id: string
  title: string
  type: string
  item_number: string
  consent_block?: string | null
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
  const [openModal, setOpenModal] = useState<'main' | 'substitute' | 'consent' | null>(null)
  const [form, setForm] = useState({
    motion_text: '',
    moved_by_person_id: '',
    seconded_by_person_id: '',
  })

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

  const presentMembers = useMemo(
    () => attendance.filter(a => a.status !== 'absent'),
    [attendance],
  )

  const activeMotion = useMemo(() => {
    const id = broadcastState?.active_motion_id
    if (!id) return motions.find(m => ['open_for_discussion', 'voting'].includes(m.status))
    return motions.find(m => m.id === id)
  }, [broadcastState?.active_motion_id, motions])

  const consentBlockItems = useMemo(() => {
    if (!currentItem?.consent_block) return []
    return allItems.filter(i => i.consent_block === currentItem.consent_block)
  }, [allItems, currentItem])

  const showPanel = currentItem?.type === 'action' || !!activeMotion

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

  const openMotion = async () => {
    if (!form.moved_by_person_id || !form.seconded_by_person_id) {
      toast('Select mover and seconder', 'error')
      return
    }
    setBusy(true)
    try {
      const body: Record<string, unknown> = {
        motion_text: form.motion_text,
        moved_by_person_id: form.moved_by_person_id,
        seconded_by_person_id: form.seconded_by_person_id,
        motion_type: openModal === 'substitute' ? 'substitute' : 'main',
      }
      if (openModal === 'substitute' && activeMotion) {
        body.parent_motion_id = activeMotion.id
      }
      if (openModal === 'consent' && currentItem?.consent_block) {
        body.consent_block = currentItem.consent_block
        body.motion_type = 'main'
      } else if (currentItem && openModal !== 'consent') {
        body.agenda_item_id = currentItem.id
      }
      const res = await fetch(`/api/board-meetings/${productionId}/motions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) toast(data.error || 'Failed', 'error')
      else {
        setOpenModal(null)
        await load()
        onUpdated()
      }
    } finally {
      setBusy(false)
    }
  }

  const startVoteUi = async (motionId: string) => {
    const ok = await post(`${motionId}/open-vote`, { vote_mode: voteMode })
    if (ok) {
      setVotingMotionId(motionId)
      setVoteDraft({})
    }
  }

  const voters: VoterRow[] = presentMembers.map(p => ({
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
    fontSize: '14px',
    padding: '12px 14px',
    minHeight: '48px',
    borderRadius: '10px',
    border: `0.5px solid ${border}`,
    background: cardBg,
    color: text,
    cursor: busy ? 'wait' : 'pointer',
    fontFamily: 'inherit',
    fontWeight: 600,
    opacity: busy ? 0.6 : 1,
  }

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

      {activeMotion && !votingMotionId ? (
        <div>
          <p style={{ margin: '0 0 8px', fontSize: '13px', color: muted }}>
            {activeMotion.motion_type === 'substitute' ? 'Substitute on floor' : 'Motion on floor'} · {activeMotion.status}
          </p>
          <p style={{ margin: '0 0 12px', fontSize: '15px', color: text, lineHeight: 1.4 }}>{activeMotion.motion_text}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button type="button" style={btn} disabled={disabled || busy} onClick={() => startVoteUi(activeMotion.id)}>Open vote</button>
            {activeMotion.motion_type === 'main' && activeMotion.status === 'open_for_discussion' && (
              <button
                type="button"
                style={btn}
                disabled={disabled || busy}
                onClick={() => {
                  setForm({ motion_text: '', moved_by_person_id: '', seconded_by_person_id: '' })
                  setOpenModal('substitute')
                }}
              >
                Propose substitute
              </button>
            )}
            <button type="button" style={btn} disabled={disabled || busy} onClick={() => post(`${activeMotion.id}/withdraw`)}>Withdraw</button>
            <button type="button" style={btn} disabled={disabled || busy} onClick={() => post(`${activeMotion.id}/table`)}>Table</button>
          </div>
        </div>
      ) : votingMotionId ? (
        <div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button type="button" style={{ ...btn, background: voteMode === 'voice' ? '#1e6cb5' : cardBg, color: voteMode === 'voice' ? '#fff' : text }} onClick={() => setVoteMode('voice')}>Voice</button>
            <button type="button" style={{ ...btn, background: voteMode === 'roll_call' ? '#1e6cb5' : cardBg, color: voteMode === 'roll_call' ? '#fff' : text }} onClick={() => setVoteMode('roll_call')}>Roll call</button>
          </div>
          <VoteInterface mode={voteMode} voters={voters} votes={voteDraft} onChange={(id, v) => setVoteDraft(d => ({ ...d, [id]: v }))} />
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button type="button" style={{ ...btn, background: '#166534', color: '#fff', border: 'none' }} disabled={busy} onClick={() => recordVote(votingMotionId)}>Record vote</button>
            <button type="button" style={btn} disabled={busy} onClick={() => setVotingMotionId(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <EmptyState
          currentItem={currentItem}
          consentBlockItems={consentBlockItems}
          disabled={disabled}
          busy={busy}
          btn={btn}
          muted={muted}
          onOpenMain={() => {
            setForm({
              motion_text: currentItem ? `Move to approve ${currentItem.title}` : '',
              moved_by_person_id: '',
              seconded_by_person_id: '',
            })
            setOpenModal('main')
          }}
          onOpenConsent={() => {
            setForm({
              motion_text: 'Move to approve the consent agenda as presented',
              moved_by_person_id: '',
              seconded_by_person_id: '',
            })
            setOpenModal('consent')
          }}
        />
      )}

      {broadcastState?.active_vote_result_motion_id && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `0.5px solid ${border}` }}>
          <p style={{ margin: '0 0 8px', fontSize: '13px', color: muted }}>Vote result on air</p>
          <button
            type="button"
            style={btn}
            disabled={busy}
            onClick={() => post(`${broadcastState.active_vote_result_motion_id}/dismiss-result`)}
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

      {openModal && (
        <OpenMotionModal
          form={form}
          setForm={setForm}
          presentMembers={presentMembers}
          title={
            openModal === 'consent'
              ? 'Consolidated consent motion'
              : openModal === 'substitute'
                ? 'Substitute motion'
                : 'Open motion'
          }
          onClose={() => setOpenModal(null)}
          onSave={openMotion}
          busy={busy}
        />
      )}
    </section>
  )
}

function EmptyState({
  currentItem,
  consentBlockItems,
  disabled,
  busy,
  btn,
  muted,
  onOpenMain,
  onOpenConsent,
}: {
  currentItem?: AgendaItem
  consentBlockItems: AgendaItem[]
  disabled?: boolean
  busy: boolean
  btn: React.CSSProperties
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
      <button type="button" style={btn} disabled={disabled || busy} onClick={onOpenMain}>Open motion</button>
      {isFirstInConsent && consentBlockItems.length > 1 && (
        <div style={{ marginTop: '12px' }}>
          <p style={{ fontSize: '13px', color: muted, margin: '0 0 8px' }}>
            Consent block ({consentBlockItems[0].item_number} – {consentBlockItems[consentBlockItems.length - 1].item_number})
          </p>
          <button type="button" style={btn} disabled={disabled || busy} onClick={onOpenConsent}>Open consolidated motion</button>
        </div>
      )}
    </div>
  )
}

function OpenMotionModal({
  title,
  form,
  setForm,
  presentMembers,
  onClose,
  onSave,
  busy,
}: {
  title: string
  form: { motion_text: string; moved_by_person_id: string; seconded_by_person_id: string }
  setForm: (f: typeof form) => void
  presentMembers: AttendanceRecord[]
  onClose: () => void
  onSave: () => void
  busy: boolean
}) {
  const text = 'var(--text-primary)'
  const border = 'var(--border-subtle)'
  const seconderOptions = presentMembers.filter(p => p.person_id !== form.moved_by_person_id)

  return (
    <ModalShell onClose={onClose}>
      <h3 style={{ margin: '0 0 12px', color: text }}>{title}</h3>
      <label style={{ display: 'block', marginBottom: '12px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Motion text</span>
        <textarea
          value={form.motion_text}
          onChange={e => setForm({ ...form, motion_text: e.target.value })}
          rows={3}
          style={{ width: '100%', marginTop: '4px', padding: '10px', borderRadius: '8px', border: `0.5px solid ${border}`, fontFamily: 'inherit' }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: '12px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Moved by</span>
        <select
          value={form.moved_by_person_id}
          onChange={e => setForm({ ...form, moved_by_person_id: e.target.value, seconded_by_person_id: '' })}
          style={{ width: '100%', marginTop: '4px', padding: '10px', borderRadius: '8px' }}
        >
          <option value="">Select…</option>
          {presentMembers.map(p => (
            <option key={p.person_id} value={p.person_id}>{p.name}</option>
          ))}
        </select>
      </label>
      <label style={{ display: 'block', marginBottom: '16px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Seconded by</span>
        <select
          value={form.seconded_by_person_id}
          onChange={e => setForm({ ...form, seconded_by_person_id: e.target.value })}
          style={{ width: '100%', marginTop: '4px', padding: '10px', borderRadius: '8px' }}
        >
          <option value="">Select…</option>
          {seconderOptions.map(p => (
            <option key={p.person_id} value={p.person_id}>{p.name}</option>
          ))}
        </select>
      </label>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onClose} style={{ padding: '10px 14px', borderRadius: '8px', border: `0.5px solid ${border}`, background: 'transparent', cursor: 'pointer' }}>Cancel</button>
        <button type="button" disabled={busy} onClick={onSave} style={{ padding: '10px 14px', borderRadius: '8px', border: 'none', background: '#1e6cb5', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Open for discussion</button>
      </div>
    </ModalShell>
  )
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
    >
      <ModalBox onClose={onClose}>{children}</ModalBox>
    </div>
  )
}

function ModalBox({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      role="dialog"
      onClick={e => e.stopPropagation()}
      style={{ background: 'var(--surface-1)', borderRadius: '12px', padding: '20px', maxWidth: '480px', width: '100%', border: '0.5px solid var(--border-subtle)' }}
    >
      {children}
    </div>
  )
}
