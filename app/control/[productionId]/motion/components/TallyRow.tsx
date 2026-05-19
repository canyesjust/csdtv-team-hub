'use client'

type Props = {
  yea: number
  nay: number
  abstain: number
  absent: number
  projection: string
  projectionVariant: 'success' | 'danger'
  quorumNote?: string
}

export default function TallyRow({ yea, nay, abstain, absent, projection, projectionVariant, quorumNote }: Props) {
  const projColor = projectionVariant === 'success' ? 'var(--semantic-success-text)' : 'var(--semantic-danger-text)'
  return (
    <div className="ms-tally">
      <TallyBlock label="YEA" value={yea} bg="var(--semantic-success-bg)" fg="var(--semantic-success-text)" />
      <TallyBlock label="NAY" value={nay} bg="var(--semantic-danger-bg)" fg="var(--semantic-danger-text)" />
      <TallyBlock label="ABSTAIN" value={abstain} bg="var(--semantic-warning-bg)" fg="var(--semantic-warning-text)" />
      <div style={{
        padding: '12px 14px',
        background: 'var(--surface-1, #131b2e)',
        border: '0.5px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
        borderRadius: 8,
      }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted, #6b7385)', letterSpacing: '0.06em' }}>PROJECTED</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: projColor, marginTop: 2 }}>
          {projection}
        </div>
        {quorumNote && (
          <div style={{ fontSize: 10, color: 'var(--text-muted, #6b7385)', marginTop: 2 }}>
            {quorumNote}
          </div>
        )}
        {absent > 0 && (
          <div style={{ fontSize: 10, color: 'var(--text-muted, #6b7385)', marginTop: 2 }}>
            {absent} absent
          </div>
        )}
      </div>
    </div>
  )
}

function TallyBlock({ label, value, bg, fg }: { label: string; value: number; bg: string; fg: string }) {
  return (
    <div style={{ padding: '12px 14px', background: bg, borderRadius: 8 }}>
      <div style={{ fontSize: 10, color: fg, letterSpacing: '0.06em', opacity: 0.85 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 500, color: fg, lineHeight: 1.1, marginTop: 2 }}>{value}</div>
    </div>
  )
}
