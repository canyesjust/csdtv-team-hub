'use client'

export type MemberOption = { person_id: string; name: string }

export default function MemberPickerGrid({
  label,
  members,
  excludeId,
  disabled,
  onSelect,
}: {
  label: string
  members: MemberOption[]
  excludeId?: string
  disabled?: boolean
  onSelect: (personId: string) => void
}) {
  const filtered = excludeId ? members.filter(m => m.person_id !== excludeId) : members

  return (
    <div>
      <p className="cs-eyebrow">{label}</p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
          gap: 10,
          marginTop: 10,
        }}
      >
        {filtered.map(m => (
          <button
            key={m.person_id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(m.person_id)}
            className="cs-touchbtn"
            style={{ textAlign: 'center' }}
          >
            {m.name}
          </button>
        ))}
      </div>
    </div>
  )
}
