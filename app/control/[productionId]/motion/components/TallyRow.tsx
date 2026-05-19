'use client'

type Props = {
  yea: number
  nay: number
  abstain: number
  absent: number
  projection: string
  projectionVariant: 'success' | 'danger' | 'info'
  quorumNote?: string
}

const PROJECTION_STYLES = {
  success: { color: 'var(--semantic-success-text)', bg: 'var(--semantic-success-bg)', border: 'var(--semantic-success-border)' },
  danger: { color: 'var(--semantic-danger-text)', bg: 'var(--semantic-danger-bg)', border: 'var(--semantic-danger-border)' },
  info: { color: 'var(--semantic-info-text)', bg: 'var(--semantic-info-bg)', border: 'var(--semantic-info-border)' },
}

export default function TallyRow({
  yea,
  nay,
  abstain,
  absent,
  projection,
  projectionVariant,
  quorumNote,
}: Props) {
  const proj = PROJECTION_STYLES[projectionVariant]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="ms-tally">
        <span className="ms-tally__item">Yea {yea}</span>
        <span className="ms-tally__item">Nay {nay}</span>
        <span className="ms-tally__item">Abstain {abstain}</span>
        <span className="ms-tally__item">Absent {absent}</span>
      </div>
      <div
        style={{
          padding: '10px 12px',
          borderRadius: 10,
          background: proj.bg,
          border: `0.5px solid ${proj.border}`,
          color: proj.color,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {projection}
        {quorumNote ? (
          <span style={{ display: 'block', marginTop: 4, fontSize: 11, fontWeight: 500, opacity: 0.9 }}>
            {quorumNote}
          </span>
        ) : null}
      </div>
    </div>
  )
}
