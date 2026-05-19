'use client'

import { useEffect, useState } from 'react'

type VoteType = 'voice' | 'roll_call'

type Props = {
  text: string | null
  moverName?: string | null
  seconderName?: string | null
  voteType?: VoteType
  readonly?: boolean
  embedded?: boolean
  onEditText?: (text: string) => void
  onChangeVoteType?: (voteType: VoteType) => void
  onClearMover?: () => void
  onClearSeconder?: () => void
}

export default function MotionTextCard({
  text,
  moverName,
  seconderName,
  voteType = 'voice',
  readonly,
  embedded,
  onEditText,
  onChangeVoteType,
  onClearMover,
  onClearSeconder,
}: Props) {
  const [draft, setDraft] = useState(text ?? '')
  useEffect(() => {
    setDraft(text ?? '')
  }, [text])

  const shell: React.CSSProperties = embedded
    ? { padding: 0, border: 'none', background: 'transparent' }
    : {
        padding: 14,
        background: 'var(--surface-1)',
        border: '0.5px solid var(--border-subtle)',
        borderRadius: 12,
      }

  const commitText = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== (text ?? '').trim()) onEditText?.(trimmed)
  }

  return (
    <section style={shell}>
      {!embedded && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 8 }}>
          MOTION TEXT
        </div>
      )}

      {readonly ? (
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.45, color: 'var(--text-primary)' }}>{text || '—'}</p>
      ) : (
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitText}
          rows={3}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: 12,
            borderRadius: 10,
            border: '0.5px solid var(--border-subtle)',
            background: 'var(--surface-2)',
            color: 'var(--text-primary)',
            fontFamily: 'inherit',
            fontSize: 15,
            lineHeight: 1.4,
            resize: 'vertical',
          }}
        />
      )}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginTop: 12,
          alignItems: 'center',
        }}
      >
        <RoleChip label="Mover" name={moverName} onClear={readonly ? undefined : onClearMover} />
        <RoleChip label="Seconder" name={seconderName} onClear={readonly ? undefined : onClearSeconder} />
        {!readonly && onChangeVoteType && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button
              type="button"
              className={`cs-touchbtn${voteType === 'voice' ? ' cs-touchbtn-primary' : ''}`}
              onClick={() => onChangeVoteType('voice')}
            >
              Voice
            </button>
            <button
              type="button"
              className={`cs-touchbtn${voteType === 'roll_call' ? ' cs-touchbtn-primary' : ''}`}
              onClick={() => onChangeVoteType('roll_call')}
            >
              Roll call
            </button>
          </div>
        )}
        {readonly && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
            {voteType === 'voice' ? 'Voice vote' : 'Roll call vote'}
          </span>
        )}
      </div>
    </section>
  )
}

function RoleChip({
  label,
  name,
  onClear,
}: {
  label: string
  name?: string | null
  onClear?: () => void
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 8,
        background: 'var(--surface-2)',
        border: '0.5px solid var(--border-subtle)',
        fontSize: 12,
        color: 'var(--text-primary)',
      }}
    >
      <span style={{ color: 'var(--text-muted)' }}>{label}:</span>
      <strong>{name || '—'}</strong>
      {name && onClear && (
        <button
          type="button"
          onClick={onClear}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--semantic-danger-text)',
            cursor: 'pointer',
            fontSize: 11,
            padding: 0,
          }}
        >
          Clear
        </button>
      )}
    </span>
  )
}
