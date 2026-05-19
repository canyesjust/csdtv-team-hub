'use client'

import type { VotingMember } from '@/lib/board-meetings/motion-types'

type Props = {
  members: VotingMember[]
  moverId: string | null | undefined
  seconderId: string | null | undefined
  onPick: (personId: string) => void
}

export default function MemberPickerGrid({ members, moverId, seconderId, onPick }: Props) {
  return (
    <div className="ms-vote-grid">
      {members.map(m => {
        const isMover = m.id === moverId
        const isSeconder = m.id === seconderId
        const highlighted = isMover || isSeconder
        const bg = highlighted ? 'var(--semantic-info-bg)' : 'var(--surface-1, #131b2e)'
        const border = highlighted ? 'var(--semantic-info-border)' : 'var(--border-subtle, rgba(255, 255, 255, 0.08))'
        const labelText = isMover ? 'MOVER' : (isSeconder ? 'SECONDER' : (m.officer_position || m.district || ''))
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onPick(m.id)}
            style={{
              padding: '14px 10px',
              borderRadius: 8,
              border: `0.5px solid ${border}`,
              background: bg,
              textAlign: 'center',
              cursor: 'pointer',
              minHeight: 100,
              color: 'var(--text-primary, #f8fafc)',
              fontFamily: 'inherit',
            }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--semantic-info-bg)',
              color: 'var(--semantic-info-text)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 500, marginBottom: 6,
            }}>
              {m.initials}
            </div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{m.display_name}</div>
            <div style={{
              fontSize: 10,
              color: highlighted ? 'var(--semantic-info-text)' : 'var(--text-muted, #6b7385)',
              marginTop: 2,
              fontWeight: highlighted ? 500 : 400,
            }}>
              {labelText}
            </div>
          </button>
        )
      })}
    </div>
  )
}
