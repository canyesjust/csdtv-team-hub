'use client'

type Member = { id: string; name: string; avatar_color: string }

type Props = {
  team: Member[]
  value: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
  compact?: boolean
}

export default function TaskAssigneePicker({ team, value, onChange, disabled, compact }: Props) {
  const selected = new Set(value)

  const toggle = (id: string) => {
    if (disabled) return
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange([...next])
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: compact ? '4px' : '6px',
        alignItems: 'center',
      }}
    >
      {team.map(m => {
        const on = selected.has(m.id)
        return (
          <button
            key={m.id}
            type="button"
            disabled={disabled}
            onClick={() => toggle(m.id)}
            title={m.name}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: compact ? '2px 6px' : '4px 8px',
              borderRadius: '999px',
              border: on ? '1px solid var(--brand-primary)' : '1px solid var(--border-subtle)',
              background: on ? 'rgba(91,163,224,0.15)' : 'var(--surface-2)',
              color: 'var(--text-primary)',
              fontSize: compact ? '11px' : '12px',
              fontWeight: on ? 600 : 500,
              cursor: disabled ? 'default' : 'pointer',
              fontFamily: 'inherit',
              opacity: disabled ? 0.6 : 1,
            }}
          >
            <span
              style={{
                width: compact ? '18px' : '20px',
                height: compact ? '18px' : '20px',
                borderRadius: '50%',
                background: m.avatar_color,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '8px',
                fontWeight: 700,
                color: '#0a0f1e',
              }}
            >
              {m.name.slice(0, 2).toUpperCase()}
            </span>
            {!compact ? m.name.split(' ')[0] : null}
          </button>
        )
      })}
      {value.length === 0 && (
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Unassigned</span>
      )}
    </div>
  )
}
