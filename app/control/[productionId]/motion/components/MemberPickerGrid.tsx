'use client'

import type { MotionVotingMember } from '@/lib/board-meetings/types'

type Props = {
  members: MotionVotingMember[]
  moverId?: string | null
  seconderId?: string | null
  onPick: (personId: string) => void
}

export default function MemberPickerGrid({ members, moverId, seconderId, onPick }: Props) {
  return (
    <div
      className="ms-member-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 10,
      }}
    >
      {members.map(m => {
        const isMover = m.id === moverId
        const isSeconder = m.id === seconderId
        const role = isMover ? 'Mover' : isSeconder ? 'Seconder' : null
        return (
          <button
            key={m.id}
            type="button"
            className={`cs-touchbtn${isMover || isSeconder ? ' cs-touchbtn-primary' : ''}`}
            onClick={() => onPick(m.id)}
            style={{
              minHeight: 72,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              textAlign: 'center',
              borderColor: isMover
                ? 'var(--semantic-success-border)'
                : isSeconder
                  ? 'var(--semantic-info-border)'
                  : undefined,
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 600 }}>{m.display_name}</span>
            {role && (
              <span style={{ fontSize: 10, letterSpacing: '0.06em', opacity: 0.9 }}>{role.toUpperCase()}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
