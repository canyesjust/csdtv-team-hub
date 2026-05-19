'use client'

export default function HeldMotionCard({
  label,
  motionText,
}: {
  label: string
  motionText: string
}) {
  return (
    <div className="cs-card" style={{ borderColor: 'var(--semantic-warning-border)', background: 'var(--semantic-warning-bg)' }}>
      <p className="cs-eyebrow">{label}</p>
      <p style={{ margin: '8px 0 0', fontSize: 15, lineHeight: 1.4, color: 'var(--text-primary)' }}>{motionText}</p>
    </div>
  )
}
