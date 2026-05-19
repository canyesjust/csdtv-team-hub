'use client'

import type { MotionVotingMember } from '@/lib/board-meetings/types'

type VoteChoice = 'yea' | 'nay' | 'abstain' | 'absent' | 'recused'

const VOTE_CYCLE: VoteChoice[] = ['yea', 'nay', 'abstain', 'absent', 'recused']

const VOTE_LABEL: Record<VoteChoice, string> = {
  yea: 'Yea',
  nay: 'Nay',
  abstain: 'Abstain',
  absent: 'Absent',
  recused: 'Recused',
}

const VOTE_COLOR: Record<VoteChoice, string> = {
  yea: 'var(--semantic-success-text)',
  nay: 'var(--semantic-danger-text)',
  abstain: 'var(--text-muted)',
  absent: 'var(--text-muted)',
  recused: 'var(--text-muted)',
}

type Props = {
  members: MotionVotingMember[]
  votes: Record<string, string>
  mover?: string | null
  seconder?: string | null
  parentMover?: string | null
  parentSeconder?: string | null
  onRecordVote: (personId: string, vote: VoteChoice) => void
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
  const cycleVote = (personId: string) => {
    const current = (votes[personId] as VoteChoice | undefined) ?? 'yea'
    const idx = VOTE_CYCLE.indexOf(current)
    const next = VOTE_CYCLE[(idx + 1) % VOTE_CYCLE.length]
    onRecordVote(personId, next)
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 10,
      }}
    >
      {members.map(m => {
        const vote = (votes[m.id] as VoteChoice | undefined) ?? null
        const tags: string[] = []
        if (m.id === mover) tags.push('Mover')
        if (m.id === seconder) tags.push('Seconder')
        if (m.id === parentMover) tags.push('Main mover')
        if (m.id === parentSeconder) tags.push('Main seconder')

        return (
          <button
            key={m.id}
            type="button"
            className="cs-touchbtn"
            onClick={() => cycleVote(m.id)}
            style={{
              minHeight: 88,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>{m.display_name}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: vote ? VOTE_COLOR[vote] : 'var(--text-muted)' }}>
              {vote ? VOTE_LABEL[vote] : 'Tap to vote'}
            </span>
            {tags.length > 0 && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{tags.join(' · ')}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
