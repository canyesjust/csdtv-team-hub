'use client'

import { useState } from 'react'
import type { MotionScreenBundle, VoteValue } from '@/lib/board-meetings/motion-types'
import { confirmDialog } from '@/lib/confirm'
import { decideMotion } from '@/lib/board-meetings/vote-math'

const C = {
  bg: '#0b1320',
  panel: '#131d2e',
  panel2: '#1a2740',
  line: 'rgba(255,255,255,0.09)',
  text: '#eef3fb',
  soft: '#9fb0cf',
  dim: '#64748b',
  accent: '#5aa0e6',
  accentBg: 'rgba(90,160,230,0.18)',
  yea: '#34d399',
  yeaBg: 'rgba(52,211,153,0.16)',
  nay: '#f87171',
  nayBg: 'rgba(248,113,113,0.16)',
  abstain: '#fbbf24',
  abstainBg: 'rgba(251,191,36,0.16)',
}

const VOTE_META: Record<string, { label: string; color: string; bg: string }> = {
  yea: { label: 'Aye', color: C.yea, bg: C.yeaBg },
  nay: { label: 'Nay', color: C.nay, bg: C.nayBg },
  abstain: { label: 'Abstain', color: C.abstain, bg: C.abstainBg },
  absent: { label: 'Absent', color: C.dim, bg: 'transparent' },
  recused: { label: 'Recused', color: C.dim, bg: 'transparent' },
}

const NEXT_VOTE: Record<string, VoteValue> = { yea: 'nay', nay: 'abstain', abstain: 'yea' }

type AttStatus = 'present' | 'remote' | 'absent'

type Props = {
  bundle: MotionScreenBundle
  busy: boolean
  error: string | null
  onAction: (action: string, body?: unknown) => void
  onMinimize: () => void
  onPushResult: () => void
  onSetAttendance: (personId: string, status: AttStatus) => void
  /** When embedded in the console: drop the full-screen chrome and attendance strip. */
  inline?: boolean
}

export default function MotionScreenOnePage({ bundle, busy, error, onAction, onMinimize, onPushResult, onSetAttendance, inline = false }: Props) {
  const motion = bundle.active_motion
  const isVoting = motion?.status === 'voting'
  const item = bundle.current_agenda_item
  const members = bundle.voting_members

  const attendanceOf = (id: string) => bundle.votes[id]?.attendance ?? 'present'
  const voteOf = (id: string): VoteValue => {
    const a = attendanceOf(id)
    if (a === 'absent') return 'absent'
    return (bundle.votes[id]?.vote as VoteValue) ?? 'yea'
  }

  const present = members.filter(m => attendanceOf(m.id) !== 'absent')
  let yea = 0, nay = 0, abstain = 0
  present.forEach(m => { const v = voteOf(m.id); if (v === 'yea') yea++; else if (v === 'nay') nay++; else if (v === 'abstain') abstain++; })
  // Use the shared Robert's Rules engine so this matches exactly what gets pushed
  // to screen. Abstentions are NOT counted against the motion — a simple majority
  // is yea > nay among the votes actually cast.
  const decision = decideMotion(
    { yea, nay, abstain, absent: members.length - present.length },
    { quorumThreshold: bundle.quorum_size },
  )
  const carried = decision.result === 'passed'
  const quorumMet = decision.quorumMet

  // Option C: the operator types into a LOCAL draft. Nothing reaches the dais /
  // overlay until "Update on screen" is clicked. draftText === null means "not
  // editing — mirror the published text live"; once they type, the draft holds
  // their edit and is compared against the published value to show a pending badge.
  const publishedText = (motion?.text ?? bundle.suggested_motion_text ?? '')
  const [draftText, setDraftText] = useState<string | null>(null)
  const textValue = draftText ?? publishedText
  const textDirty = draftText !== null && draftText.trim() !== publishedText.trim()
  const onTextChange = (v: string) => {
    setDraftText(v)
    // Pre-mover there's no motion record yet; keep the local pending text in sync so
    // opening the motion uses the latest wording even if not yet published.
    if (!motion) onAction('set-text', { text: v })
  }
  const publishText = () => {
    onAction('publish-text', { text: textValue, agenda_item_id: bundle.current_agenda_item_id })
    setDraftText(null)
  }

  const chip = (selected: boolean): React.CSSProperties => ({
    fontSize: 15, padding: '8px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
    border: `1px solid ${selected ? 'transparent' : C.line}`,
    background: selected ? C.accentBg : 'transparent',
    color: selected ? C.accent : C.text,
    fontWeight: selected ? 600 : 400,
  })

  return (
    <div style={inline
      ? { background: 'transparent', color: C.text, fontFamily: 'system-ui, sans-serif' }
      : { height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif', padding: '18px 22px', boxSizing: 'border-box' }}>
      {!inline && (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, color: C.soft }}>
            {item ? `On air · Item ${item.item_number} — ${item.title}` : 'No agenda item on air'}
          </div>
          {bundle.live_elapsed && <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>Elapsed {bundle.live_elapsed}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 11px', borderRadius: 999, color: quorumMet ? C.yea : C.nay, background: quorumMet ? C.yeaBg : C.nayBg }}>
            {quorumMet ? 'Quorum met' : 'No quorum'} · {present.length}/{bundle.quorum_size}
          </span>
          <button type="button" onClick={onMinimize} style={{ fontSize: 13, padding: '7px 13px', borderRadius: 8, border: `1px solid ${C.line}`, background: 'transparent', color: C.text, cursor: 'pointer', fontFamily: 'inherit' }}>Minimize</button>
        </div>
      </div>
      )}

      {error && <div style={{ background: C.nayBg, color: C.nay, fontSize: 13, padding: '8px 12px', borderRadius: 8, marginBottom: 12 }}>{error}</div>}

      {!inline && (
      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.accent, marginBottom: 10 }}>Attendance</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '8px 20px' }}>
          {members.map(m => {
            const a = attendanceOf(m.id) as AttStatus
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 14, color: C.text }}>{m.display_name}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['present', 'remote', 'absent'] as AttStatus[]).map(s => {
                    const on = a === s
                    const col = s === 'absent' ? C.nay : s === 'remote' ? C.abstain : C.yea
                    return (
                      <button key={s} type="button" onClick={() => onSetAttendance(m.id, s)}
                        style={{ fontSize: 12, padding: '4px 10px', borderRadius: 7, border: `1px solid ${on ? 'transparent' : C.line}`, background: on ? col : 'transparent', color: on ? '#06101f' : C.soft, fontWeight: on ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                        {s}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      )}

      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.accent }}>
            {motion?.motion_type === 'substitute' || motion?.motion_type === 'amendment' ? 'Amendment / substitute motion' : 'Motion'}
          </span>
          <div style={{ display: 'flex', gap: 7 }}>
            {motion && (isVoting || motion.status === 'voting' || motion.status === 'passed' || motion.status === 'failed' || motion.status === 'closed' || motion.status === 'voted') && (
              <button
                type="button"
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: 'Reset this motion?',
                    message: 'Clears the recorded vote and returns the motion to discussion so the board can re-do it. Mover, seconder, and motion text are kept.',
                    confirmLabel: 'Reset motion',
                    tone: 'danger',
                  })
                  if (ok) onAction('reset')
                }}
                style={{ fontSize: 12, padding: '5px 11px', borderRadius: 8, border: `1px solid ${C.line}`, background: 'transparent', color: C.soft, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Reset / re-do
              </button>
            )}
            {motion && !isVoting && motion.motion_type === 'main' && bundle.current_agenda_item?.id && (
              <button type="button" onClick={() => onAction('propose-substitute', { agenda_item_id: bundle.current_agenda_item!.id })}
                style={{ fontSize: 12, padding: '5px 11px', borderRadius: 8, border: `1px solid ${C.line}`, background: 'transparent', color: C.accent, cursor: 'pointer', fontFamily: 'inherit' }}>
                Amend / substitute
              </button>
            )}
          </div>
        </div>
        {bundle.parent_motion && (
          <div style={{ fontSize: 12, color: C.abstain, background: C.abstainBg, padding: '7px 11px', borderRadius: 8, marginBottom: 10 }}>
            Amending the main motion: “{bundle.parent_motion.text || 'main motion'}”. The board votes this amendment first.
          </div>
        )}
        <textarea
          value={textValue}
          onChange={e => onTextChange(e.target.value)}
          rows={2}
          style={{ width: '100%', boxSizing: 'border-box', background: C.panel2, border: `1px solid ${textDirty ? C.accent : C.line}`, borderRadius: 10, color: C.text, fontSize: 18, fontWeight: 500, padding: '12px 14px', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.35 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: textDirty ? C.accent : C.dim }}>
            {textDirty ? 'Edited — not on screen yet' : 'Showing what’s on screen'}
          </span>
          <button
            type="button"
            onClick={publishText}
            disabled={busy || !textDirty}
            style={{
              fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 9, border: 'none',
              background: textDirty ? C.accent : C.line, color: textDirty ? '#06101f' : C.soft,
              cursor: textDirty ? 'pointer' : 'default', fontFamily: 'inherit',
            }}
          >
            Update on screen
          </button>
        </div>

        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 16 }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontSize: 12, color: C.soft, marginBottom: 7 }}>Moved by</div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {members.map(m => (
                <button key={m.id} type="button" style={chip(motion?.mover_id === m.id)} onClick={() => onAction('set-mover', { person_id: motion?.mover_id === m.id ? null : m.id })}>{m.display_name}</button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontSize: 12, color: C.soft, marginBottom: 7 }}>Seconded by</div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {members.map(m => (
                <button key={m.id} type="button" style={chip(motion?.seconder_id === m.id)} onClick={() => onAction('set-seconder', { person_id: motion?.seconder_id === m.id ? null : m.id })}>{m.display_name}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.accent }}>
            Vote {isVoting && <span style={{ textTransform: 'none', letterSpacing: 0, color: C.soft }}>· everyone is an aye; tap to mark nay or abstain</span>}
          </div>
          {isVoting && (
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              <span style={{ color: C.yea }}>{yea} aye</span> · <span style={{ color: C.nay }}>{nay} nay</span> · <span style={{ color: C.abstain }}>{abstain} abstain</span>
            </div>
          )}
        </div>

        {!isVoting ? (
          <button type="button" disabled={busy} onClick={() => onAction('open-vote')} style={{ width: '100%', fontSize: 17, fontWeight: 600, padding: '16px', borderRadius: 12, border: 'none', background: C.accent, color: '#06101f', cursor: 'pointer', fontFamily: 'inherit' }}>
            Open voting
          </button>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 9 }}>
              {members.map(m => {
                const att = attendanceOf(m.id)
                const v = voteOf(m.id)
                const meta = VOTE_META[v] ?? VOTE_META.yea
                const disabled = att === 'absent'
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onAction('record-vote', { person_id: m.id, vote: NEXT_VOTE[v] ?? 'nay' })}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '11px 13px', borderRadius: 10, border: `1px solid ${C.line}`, background: C.panel2, cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit', opacity: disabled ? 0.5 : 1, textAlign: 'left' }}
                  >
                    <span style={{ fontSize: 15, color: C.text }}>
                      {m.display_name}
                      {att === 'remote' && <span style={{ fontSize: 11, color: C.dim }}> · remote</span>}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999, color: meta.color, background: meta.bg }}>{meta.label}</span>
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, flexWrap: 'wrap', gap: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 600 }}>
                Result: <span style={{ color: carried ? C.yea : C.nay }}>{carried ? 'Carried' : 'Failed'}</span>
                <span style={{ fontSize: 14, fontWeight: 400, color: C.soft }}> &nbsp;{yea}–{nay}{abstain ? ` · ${abstain} abstain` : ''}</span>
                {!quorumMet && <span style={{ fontSize: 13, fontWeight: 600, color: C.nay, marginLeft: 8 }}>· No quorum</span>}
              </div>
              <button type="button" disabled={busy} onClick={onPushResult} style={{ fontSize: 16, fontWeight: 600, padding: '12px 22px', borderRadius: 12, border: 'none', background: carried ? C.yea : C.nay, color: '#06101f', cursor: 'pointer', fontFamily: 'inherit' }}>
                Push result to screen
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
