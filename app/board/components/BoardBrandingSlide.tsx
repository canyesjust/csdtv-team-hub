import { CANYONS_LOGO_SRC, CSDTV_LOGO_SRC } from '@/app/board/branding-assets'

type Variant = 'overlay' | 'overlay-corner' | 'fullscreen' | 'dais'

type Props = {
  variant?: Variant
  /** Shown under the CSDtv logo (e.g. channel name). */
  screenName?: string | null
  /** Optional line under screen name; pass null to hide. */
  statusLine?: string | null
}

export default function BoardBrandingSlide({
  variant = 'fullscreen',
  screenName,
  statusLine = null,
}: Props) {
  if (variant === 'overlay-corner') {
    return (
      <div style={overlayCornerWrap}>
        <img src={CANYONS_LOGO_SRC} alt="Canyons School District" style={cornerCanyonsLogo} />
        <img src={CSDTV_LOGO_SRC} alt="CSDtv" style={cornerCsdtvLogo} />
      </div>
    )
  }

  if (variant === 'dais') {
    return (
      <div style={daisWrap}>
        <img src={CANYONS_LOGO_SRC} alt="Canyons School District" style={daisCanyonsLogo} />
        <p style={daisBroughtBy}>brought to you by</p>
        <img src={CSDTV_LOGO_SRC} alt="CSDtv" style={daisCsdtvLogo} />
        {screenName ? <p style={daisScreenName}>{screenName}</p> : null}
        {statusLine ? <p style={daisStatusLine}>{statusLine}</p> : null}
      </div>
    )
  }

  const isOverlay = variant === 'overlay'
  const muted = isOverlay ? '#94a3b8' : '#8899bb'
  const broughtBy = isOverlay ? '#cbd5e1' : '#a8b8d8'
  const titleColor = isOverlay ? '#f0f4ff' : '#f0f4ff'

  return (
    <div style={isOverlay ? overlayWrap : fullscreenWrap}>
      <img src={CANYONS_LOGO_SRC} alt="Canyons School District" style={canyonsLogo} />
      <p style={{ ...broughtByText, color: broughtBy }}>brought to you by</p>
      <img src={CSDTV_LOGO_SRC} alt="CSDtv" style={csdtvLogo} />
      {screenName ? (
        <p style={{ ...screenNameText, color: titleColor }}>{screenName}</p>
      ) : null}
      {statusLine ? (
        <p style={{ ...statusLineText, color: muted }}>{statusLine}</p>
      ) : null}
    </div>
  )
}

const overlayCornerWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '10px',
}

const cornerCanyonsLogo: React.CSSProperties = {
  width: 'min(200px, 40vw)',
  height: 'auto',
  maxHeight: '72px',
  objectFit: 'contain',
  display: 'block',
}

const cornerCsdtvLogo: React.CSSProperties = {
  width: 'min(140px, 32vw)',
  height: 'auto',
  maxHeight: '48px',
  objectFit: 'contain',
  display: 'block',
}

const overlayWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  width: '100%',
}

const fullscreenWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  maxWidth: '420px',
  width: '100%',
}

const daisWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  marginTop: '28px',
  padding: '40px 36px',
  borderRadius: '20px',
  background: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
  maxWidth: '560px',
}

const canyonsLogo: React.CSSProperties = {
  width: 'min(280px, 72vw)',
  height: 'auto',
  maxHeight: '120px',
  objectFit: 'contain',
  marginBottom: '20px',
}

const broughtByText: React.CSSProperties = {
  margin: '0 0 14px',
  fontSize: '13px',
  fontWeight: 500,
  letterSpacing: '0.12em',
  textTransform: 'lowercase',
}

const csdtvLogo: React.CSSProperties = {
  width: 'min(200px, 55vw)',
  height: 'auto',
  maxHeight: '72px',
  objectFit: 'contain',
  marginBottom: '28px',
}

const screenNameText: React.CSSProperties = {
  margin: 0,
  fontSize: '15px',
  fontWeight: 600,
  letterSpacing: '0.04em',
  lineHeight: 1.35,
}

const statusLineText: React.CSSProperties = {
  margin: '8px 0 0',
  fontSize: '12px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

const daisCanyonsLogo: React.CSSProperties = {
  width: 'min(420px, 85%)',
  height: 'auto',
  maxHeight: '140px',
  objectFit: 'contain',
  marginBottom: '24px',
}

const daisBroughtBy: React.CSSProperties = {
  margin: '0 0 18px',
  fontSize: '15px',
  fontWeight: 500,
  letterSpacing: '0.14em',
  textTransform: 'lowercase',
  color: '#a8b8d8',
}

const daisCsdtvLogo: React.CSSProperties = {
  width: 'min(280px, 70%)',
  height: 'auto',
  maxHeight: '88px',
  objectFit: 'contain',
  marginBottom: '8px',
}

const daisScreenName: React.CSSProperties = {
  margin: '20px 0 0',
  fontSize: '18px',
  fontWeight: 600,
  letterSpacing: '0.04em',
  color: '#f1f5f9',
}

const daisStatusLine: React.CSSProperties = {
  margin: '8px 0 0',
  fontSize: '13px',
  color: '#64748b',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}
