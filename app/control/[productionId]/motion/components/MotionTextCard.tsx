'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'

type Props = {
  text: string | null
  moverName: string | null
  seconderName: string | null
  voteType: 'voice' | 'roll_call'
  readonly?: boolean
  embedded?: boolean
  onEditText?: (text: string) => void
  onChangeVoteType?: (t: 'voice' | 'roll_call') => void
  onClearMover?: () => void
  onClearSeconder?: () => void
}

export default function MotionTextCard(props: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(props.text || '')

  const wrap: CSSProperties = props.embedded
    ? {}
    : {
        padding: '14px 16px',
        background: 'var(--surface-1)',
        border: '0.5px solid var(--border-subtle)',
        borderRadius: 12,
      }

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          {!props.embedded && (
            <div className="cs-eyebrow" style={{ marginBottom: 4 }}>
              Motion
            </div>
          )}
          {editing ? (
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={() => {
                setEditing(false)
                if (props.onEditText && draft !== props.text) props.onEditText(draft)
              }}
              autoFocus
              rows={2}
              style={{
                width: '100%',
                fontSize: 15,
                background: 'var(--surface-2)',
                color: 'var(--text-primary)',
                border: '0.5px solid var(--border-subtle)',
                borderRadius: 8,
                padding: '8px 10px',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          ) : (
            <div style={{ fontSize: 15, lineHeight: 1.45 }}>
              {props.text || <em style={{ color: 'var(--text-muted)' }}>No motion text yet</em>}
            </div>
          )}
        </div>
        {!props.readonly && props.onEditText && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{
              fontSize: 11,
              padding: '5px 10px',
              background: 'var(--surface-2)',
              border: '0.5px solid var(--border-subtle)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            Edit
          </button>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 14,
          alignItems: 'center',
          flexWrap: 'wrap',
          paddingTop: 10,
          borderTop: '0.5px solid var(--border-subtle)',
        }}
      >
        <PersonChip label="Mover" name={props.moverName} onClear={props.onClearMover} />
        <PersonChip label="Seconded by" name={props.seconderName} onClear={props.onClearSeconder} />
        {!props.readonly && props.onChangeVoteType && (
          <div
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              padding: 3,
              background: 'var(--surface-2)',
              border: '0.5px solid var(--border-subtle)',
              borderRadius: 999,
            }}
          >
            <ToggleBtn active={props.voteType === 'voice'} onClick={() => props.onChangeVoteType!('voice')}>
              Voice vote
            </ToggleBtn>
            <ToggleBtn active={props.voteType === 'roll_call'} onClick={() => props.onChangeVoteType!('roll_call')}>
              Roll call
            </ToggleBtn>
          </div>
        )}
      </div>
    </div>
  )
}

function PersonChip({ label, name, onClear }: { label: string; name: string | null; onClear?: () => void }) {
  if (!name) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}:</span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            borderRadius: 999,
            background: 'var(--semantic-warning-bg)',
            color: 'var(--semantic-warning-text)',
            fontSize: 12,
            fontWeight: 500,
            border: '0.5px dashed var(--semantic-warning-border)',
          }}
        >
          ↓ Tap a member below
        </span>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}:</span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '4px 10px',
          borderRadius: 999,
          background: 'var(--semantic-info-bg)',
          color: 'var(--semantic-info-text)',
          fontSize: 12,
          fontWeight: 500,
          cursor: onClear ? 'pointer' : 'default',
        }}
        onClick={onClear}
      >
        {name} {onClear ? '✕' : ''}
      </span>
    </div>
  )
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '5px 12px',
        fontSize: 11,
        background: active ? 'var(--semantic-info-bg)' : 'transparent',
        color: active ? 'var(--semantic-info-text)' : 'var(--text-muted)',
        border: 'none',
        borderRadius: 999,
        fontWeight: active ? 500 : 400,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
