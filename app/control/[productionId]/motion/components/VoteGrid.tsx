'use client'

import type { VoteRecord, VotingMember } from '@/lib/board-meetings/types'

type Props = {
  members: VotingMember[]
  votes: Record<string, VoteRecord>
  mover: string | null
  seconder: string | null
  parentMover?: string | null
  parentSeconder?: string | null
  onRecordVote: (personId: string, vote: 'yea' | 'nay' | 'abstain' | 'absent' | 'recused') => void
}

const NEXT_VOTE: Record<string, 'yea' | 'nay' | 'abstain'> = {
  yea: 'nay',
  nay: 'abstain',
  abstain: 'yea',
}

export default function VoteGrid({
  members,
  votes,
  mover,
  seconder,
  parentMover,
  parentSeconder,
  onRecordVote,
}: Props) {
  return (
    <div className="ms-vote-grid">
      {members.map(m => {
        const v = votes[m.id]?.vote || (votes[m.id]?.attendance === 'absent' ? 'absent' : 'yea')
        const isAbsent = v === 'absent'
        const isRecused = v === 'recused'
        const variant = isAbsent ? 'absent' : isRecused ? 'recused' : v
        const style = voteStyle(variant)
        const role = roleLabel(m, mover, seconder, parentMover, parentSeconder)

        return (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              if (isAbsent || isRecused) return
              onRecordVote(m.id, NEXT_VOTE[v] ?? 'nay')
            }}
            style={{
              padding: '12px 10px',
              borderRadius: 8,
              border: `0.5px ${isAbsent ? 'dashed' : 'solid'} ${style.border}`,
              background: style.bg,
              cursor: isAbsent || isRecused ? 'default' : 'pointer',
              textAlign: 'left',
              color: 'inherit',
              fontFamily: 'inherit',
              minHeight: 100,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 500, color: style.fg }}>{m.display_name}</div>
            <div style={{ fontSize: 10, color: style.fg, opacity: 0.75 }}>{role || m.district}</div>
            <div
              style={{
                marginTop: 10,
                padding: '4px 0',
                textAlign: 'center',
                background: variant === 'absent' || variant === 'recused' ? 'transparent' : style.fg,
                color: variant === 'absent' || variant === 'recused' ? style.fg : style.bg,
                border: variant === 'absent' || variant === 'recused' ? `0.5px solid ${style.border}` : 'none',
                fontSize: 11,
                fontWeight: 500,
                borderRadius: 6,
                letterSpacing: '0.06em',
              }}
            >
              {variant.toUpperCase()}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function voteStyle(v: string) {
  switch (v) {
    case 'yea':
      return {
        bg: 'var(--semantic-success-bg)',
        border: 'var(--semantic-success-border)',
        fg: 'var(--semantic-success-text)',
      }
    case 'nay':
      return {
        bg: 'var(--semantic-danger-bg)',
        border: 'var(--semantic-danger-border)',
        fg: 'var(--semantic-danger-text)',
      }
    case 'abstain':
      return {
        bg: 'var(--semantic-warning-bg)',
        border: 'var(--semantic-warning-border)',
        fg: 'var(--semantic-warning-text)',
      }
    case 'absent':
      return { bg: 'transparent', border: 'var(--border-subtle)', fg: 'var(--text-muted)' }
    case 'recused':
      return { bg: 'transparent', border: 'var(--border-subtle)', fg: 'var(--text-muted)' }
    default:
      return { bg: 'var(--surface-1)', border: 'var(--border-subtle)', fg: 'var(--text-primary)' }
  }
}

function roleLabel(
  m: VotingMember,
  mover: string | null,
  seconder: string | null,
  parentMover: string | null | undefined,
  parentSeconder: string | null | undefined,
): string {
  const parts: string[] = []
  if (m.officer_position) parts.push(m.officer_position)
  if (m.id === mover) parts.push('Sub mover')
  else if (m.id === seconder) parts.push('Sub seconder')
  else if (m.id === parentMover) parts.push('Main mover')
  else if (m.id === parentSeconder) parts.push('Main seconder')
  const district = m.district || ''
  if (parts.length === 0) return district
  return `${district} · ${parts.join(' · ')}`
}
