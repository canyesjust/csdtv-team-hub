export default function BoardPlaceholder({
  channelNumber,
  viewLabel,
  channelName,
}: {
  channelNumber: number
  viewLabel: string
  channelName?: string
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0f1e',
        color: '#f0f4ff',
        fontFamily: 'system-ui, sans-serif',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <p style={{ fontSize: '14px', color: '#8899bb', marginBottom: '8px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        CSDtv Board Output
      </p>
      <h1 style={{ fontSize: '28px', fontWeight: 600, margin: '0 0 12px' }}>No production active</h1>
      <p style={{ fontSize: '16px', color: '#8899bb', margin: 0, maxWidth: '420px', lineHeight: 1.5 }}>
        Channel {channelNumber}
        {channelName ? ` · ${channelName}` : ''} · {viewLabel}
      </p>
      <p style={{ fontSize: '13px', color: '#4a5a7a', marginTop: '24px' }}>
        Live broadcast surfaces ship in Phase 2.
      </p>
    </div>
  )
}
