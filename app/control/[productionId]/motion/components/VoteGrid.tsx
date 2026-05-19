'use client'

import type { VotingMember, VoteRecord } from '@/lib/board-meetings/motion-types'

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

export default function VoteGrid({ members, votes, mover, seconder, parentMover, parentSeconder, onRecordVote }: Props) {
  return (
    <div className="ms-vote-grid">
      {members.map(m => {
        const record = votes[m.id]
        const isAbsentAttendance = record?.attendance === 'absent'
        const currentVote: string = isAbsentAttendance
          ? 'absent'
          : (record?.vote || 'yea')

        const isAbsent = currentVote === 'absent'
        const isRecused = currentVote === 'recused'
        const variant = currentVote
        const style = voteStyle(variant)
        const role = roleLabel(m, mover, seconder, parentMover, parentSeconder)

        return (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              if (isAbsent || isRecused) return
              onRecordVote(m.id, NEXT_VOTE[currentVote] || 'yea')
            }}
            style={{
              padding: '12px 10px',
              borderRadius: 8,
              border: `0.5px ${isAbsent ? 'dashed' : 'solid'} ${style.border}`,
              background: style.bg,
              cursor: (isAbsent || isRecused) ? 'default' : 'pointer',
              textAlign: 'left',
              color: 'inherit',
              fontFamily: 'inherit',
              minHeight: 100,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 500, color: style.fg }}>
              {m.display_name}
            </div>
            <div style={{ fontSize: 10, color: style.fg, opacity: 0.75 }}>
              {role}
            </div>
            <div style={{
              marginTop: 10,
              padding: '4px 0',
              textAlign: 'center',
              background: (variant === 'absent' || variant === 'recused') ? 'transparent' : style.fg,
              color: (variant === 'absent' || variant === 'recused') ? style.fg : style.bg,
              border: (variant === 'absent' || variant === 'recused') ? `0.5px solid ${style.border}` : 'none',
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 6,
              letterSpacing: '0.06em',
            }}>
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
    case 'yea': return { bg: 'var(--semantic-success-bg)', border: 'var(--semantic-success-border)', fg: 'var(--semantic-success-text)' }
    case 'nay': return { bg: 'var(--semantic-danger-bg)',  border: 'var(--semantic-danger-border)',  fg: 'var(--semantic-danger-text)'  }
    case 'abstain': return { bg: 'var(--semantic-warning-bg)', border: 'var(--semantic-warning-border)', fg: 'var(--semantic-warning-text)' }
    case 'absent': return { bg: 'transparent', border: 'var(--border-subtle, rgba(255, 255, 255, 0.08))', fg: 'var(--text-muted, #6b7385)' }
    case 'recused': return { bg: 'transparent', border: 'var(--border-subtle, rgba(255, 255, 255, 0.08))', fg: 'var(--text-muted, #6b7385)' }
    default: return { bg: 'var(--surface-1, #131b2e)', border: 'var(--border-subtle, rgba(255, 255, 255, 0.08))', fg: 'var(--text-primary, #f8fafc)' }
  }
}

function roleLabel(m: VotingMember, mover: string | null, seconder: string | null, parentMover: string | null | undefined, parentSeconder: string | null | undefined): string {
  const parts: string[] = []
  if (m.district) parts.push(m.district)
  if (m.officer_position) parts.push(m.officer_position)
  if (m.id === mover) parts.push('Sub mover')
  else if (m.id === seconder) parts.push('Sub seconder')
  else if (parentMover !== undefined && m.id === parentMover) parts.push('Main mover')
  else if (parentSeconder !== undefined && m.id === parentSeconder) parts.push('Main seconder')
  return parts.join(' · ')
}
