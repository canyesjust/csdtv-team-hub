export const CANYONS_LOGO_SRC = encodeURI('/images/Logos/Canyons Color Long Medium.webp')
export const CSDTV_LOGO_SRC = encodeURI('/images/Logos/csdtvlogo outlined.webp')

type BoardIdleBrandingProps = {
  screenName: string
  /** `overlay` = transparent page + card (OBS); `fullscreen` = solid backdrop */
  variant?: 'overlay' | 'fullscreen'
  /** Defaults to "No production active"; pass null to hide. */
  statusLine?: string | null
}

export default function BoardIdleBranding({
  screenName,
  variant = 'fullscreen',
  statusLine = 'No production active',
}: BoardIdleBrandingProps) {
  const isOverlay = variant === 'overlay'

  const page: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 24px',
    boxSizing: 'border-box',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    textAlign: 'center',
    background: isOverlay ? 'transparent' : 'linear-gradient(160deg, #0a1628 0%, #0a0f1e 100%)',
  }

  const card: React.CSSProperties = isOverlay
    ? {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        maxWidth: '420px',
        width: '100%',
        padding: '36px 32px',
        background: 'transparent',
      }
    : {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        maxWidth: '420px',
        width: '100%',
      }

  const muted = isOverlay ? '#94a3b8' : '#8899bb'
  const broughtBy = isOverlay ? '#cbd5e1' : '#a8b8d8'

  return (
    <div style={page}>
      <div style={card}>
        <img
          src={CANYONS_LOGO_SRC}
          alt="Canyons School District"
          style={{ width: 'min(280px, 72vw)', height: 'auto', maxHeight: '120px', objectFit: 'contain', marginBottom: '20px' }}
        />
        <p
          style={{
            margin: '0 0 14px',
            fontSize: '13px',
            fontWeight: 500,
            letterSpacing: '0.12em',
            textTransform: 'lowercase',
            color: broughtBy,
          }}
        >
          brought to you by
        </p>
        <img
          src={CSDTV_LOGO_SRC}
          alt="CSDtv"
          style={{ width: 'min(200px, 55vw)', height: 'auto', maxHeight: '72px', objectFit: 'contain', marginBottom: '28px' }}
        />
        <p
          style={{
            margin: 0,
            fontSize: '15px',
            fontWeight: 600,
            letterSpacing: '0.04em',
            color: '#f0f4ff',
            lineHeight: 1.35,
          }}
        >
          {screenName}
        </p>
        {statusLine ? (
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {statusLine}
          </p>
        ) : null}
      </div>
    </div>
  )
}
