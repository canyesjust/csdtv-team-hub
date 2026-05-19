'use client'

export default function MotionTextCard({
  text,
  disabled,
  onChange,
  onSave,
}: {
  text: string
  disabled?: boolean
  onChange: (value: string) => void
  onSave: () => void
}) {
  return (
    <div className="cs-card">
      <p className="cs-eyebrow">Motion text</p>
      <textarea
        value={text}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        rows={4}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          marginTop: 8,
          padding: 12px,
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
      <button
        type="button"
        className="cs-touchbtn cs-touchbtn-primary"
        style={{ marginTop: 10 }}
        disabled={disabled || !text.trim()}
        onClick={onSave}
      >
        Save text
      </button>
    </div>
  )
}
