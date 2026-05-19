'use client'

import { useState, useEffect } from 'react'

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

  useEffect(() => {
    setDraft(props.text || '')
  }, [props.text])

  const wrap: React.CSSProperties = props.embedded
    ? {}
    : {
        padding: '14px 16px',
        background: 'var(--surface-1, #131b2e)',
        border: '0.5px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
        borderRadius: 12,
      }

  const commitEdit = () => {
    setEditing(false)
    if (props.onEditText && draft !== props.text) {
      props.onEditText(draft)
    }
  }

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          {!props.embedded && (
            <div className="cs-eyebrow" style={{ marginBottom: 4 }}>Motion</div>
          )}
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              autoFocus
              rows={2}
              style={{
                width: '100%',
                fontSize: 15,
                background: 'var(--surface-2, #1a2236)',
                color: 'var(--text-primary, #f8fafc)',
                border: '0.5px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                borderRadius: 8,
                padding: '8px 10px',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          ) : (
            <div style={{ fontSize: 15, lineHeight: 1.45 }}>
              {props.text || <em style={{ color: 'var(--text-muted, #6b7385)' }}>No motion text yet</em>}
            </div>
          )}
        </div>
        {!props.readonly && props.onEditText && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{
              fontSize: 11,
              padding: '5px 10px',
              background: 'var(--surface-2, #1a2236)',
              border: '0.5px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
              borderRadius: 8,
              color: 'var(--text-primary, #f8fafc)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Edit
          </button>
        )}
      </div>
      <div style={{
        display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap',
        paddingTop: 10, borderTop: '0.5px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
      }}>
        <PersonChip label="Mover" name={props.moverName} onClear={props.onClearMover} />
        <PersonChip label="Seconded by" name={props.seconderName} onClear={props.onClearSeconder} />
        {!props.readonly && props.onChangeVoteType && (
          <div style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            padding: 3,
            background: 'var(--surface-2, #1a2236)',
            border: '0.5px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
            borderRadius: 999,
          }}>
            <ToggleBtn active={props.voteType === 'voice'} onClick={() => props.onChangeVoteType!('voice')}>Voice vote</ToggleBtn>
            <ToggleBtn active={props.voteType === 'roll_call'} onClick={() => props.onChangeVoteType!('roll_call')}>Roll call</ToggleBtn>
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
        <span style={{ fontSize: 11, color: 'var(--text-muted, #6b7385)' }}>{label}:</span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 999,
          background: 'var(--semantic-warning-bg)',
          color: 'var(--semantic-warning-text)',
          fontSize: 12, fontWeight: 500,
          border: '0.5px dashed var(--semantic-warning-border)',
        }}>
          ↓ Tap a member below
        </span>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted, #6b7385)' }}>{label}:</span>
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 999,
          background: 'var(--semantic-info-bg)',
          color: 'var(--semantic-info-text)',
          fontSize: 12, fontWeight: 500,
          cursor: onClear ? 'pointer' : 'default',
        }}
        onClick={onClear}
        title={onClear ? 'Click to clear' : undefined}
      >
        {name} {onClear ? '×' : ''}
      </span>
    </div>
  )
}

function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '5px 12px',
        fontSize: 11,
        background: active ? 'var(--semantic-info-bg)' : 'transparent',
        color: active ? 'var(--semantic-info-text)' : 'var(--text-muted, #6b7385)',
        border: 'none',
        borderRadius: 999,
        fontWeight: active ? 500 : 400,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  )
}
