'use client'

import type { VotingMember } from '@/lib/board-meetings/types'

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
        const bg = highlighted ? 'var(--semantic-info-bg)' : 'var(--surface-1)'
        const border = highlighted ? 'var(--semantic-info-border)' : 'var(--border-subtle)'
        const labelText = isMover ? 'MOVER' : isSeconder ? 'SECONDER' : m.district || ''
        const initials = (m.display_name || '')
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map(s => s[0])
          .join('')

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
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'var(--semantic-info-bg)',
                color: 'var(--semantic-info-text)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 500,
                marginBottom: 6,
              }}
            >
              {initials.toUpperCase()}
            </div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{m.display_name}</div>
            <div
              style={{
                fontSize: 10,
                color: highlighted ? 'var(--semantic-info-text)' : 'var(--text-muted)',
                marginTop: 2,
                fontWeight: highlighted ? 500 : 400,
              }}
            >
              {labelText}
            </div>
          </button>
        )
      })}
    </div>
  )
}
