'use client'

import type { VoteMode, VoteValue } from '@/lib/board-meetings/motion-types'

const CYCLE: VoteValue[] = ['yea', 'nay', 'abstain', 'recused']
const VOTE_COLORS: Record<VoteValue, string> = {
  yea: '#166534',
  nay: '#991b1b',
  abstain: '#64748b',
  absent: '#94a3b8',
  recused: '#7c3aed',
}

export type VoterRow = {
  person_id: string
  name: string
  eligible: boolean
  default_vote: VoteValue
}

export default function VoteInterface({
  mode,
  voters,
  votes,
  onChange,
}: {
  mode: VoteMode
  voters: VoterRow[]
  votes: Record<string, VoteValue | null>
  onChange: (personId: string, vote: VoteValue | null) => void
}) {
  const border = 'var(--border-subtle)'
  const text = 'var(--text-primary)'

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {voters.map(v => {
        const current = votes[v.person_id] ?? (mode === 'voice' ? (v.eligible ? 'yea' : 'absent') : null)
        return (
          <li
            key={v.person_id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '8px 0',
              borderBottom: `0.5px solid ${border}`,
              opacity: v.eligible ? 1 : 0.65,
            }}
          >
            <span style={{ fontSize: '15px', fontWeight: 500, color: text }}>{v.name}</span>
            {mode === 'voice' ? (
              <button
                type="button"
                onClick={() => {
                  const idx = current ? CYCLE.indexOf(current as VoteValue) : 0
                  const next = CYCLE[(idx + 1) % CYCLE.length]
                  onChange(v.person_id, next)
                }}
                style={{
                  minWidth: '88px',
                  minHeight: '48px',
                  padding: '8px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  background: current ? VOTE_COLORS[current as VoteValue] : '#334155',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '14px',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {current || 'yea'}
              </button>
            ) : (
              <RollCallButtons
                current={current}
                border={border}
                text={text}
                onPick={opt => onChange(v.person_id, opt)}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

function RollCallButtons({
  current,
  border,
  text,
  onPick,
}: {
  current: VoteValue | null
  border: string
  text: string
  onPick: (opt: VoteValue) => void
}) {
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {(['yea', 'nay', 'abstain', 'recused'] as VoteValue[]).map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => onPick(opt)}
          style={{
            minHeight: '44px',
            minWidth: '56px',
            padding: '6px 10px',
            borderRadius: '8px',
            border: current === opt ? 'none' : `0.5px solid ${border}`,
            background: current === opt ? VOTE_COLORS[opt] : 'transparent',
            color: current === opt ? '#fff' : text,
            fontWeight: 600,
            fontSize: '12px',
            textTransform: 'uppercase',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}
