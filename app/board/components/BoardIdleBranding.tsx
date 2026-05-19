import { overlayPanelStyle, OVERLAY_PANEL_BG_ALT } from '@/app/board/overlay-graphics'
import BoardBrandingSlide from '@/app/board/components/BoardBrandingSlide'

export { CANYONS_LOGO_SRC, CSDTV_LOGO_SRC } from '@/app/board/branding-assets'

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

  const page: React.CSSProperties = isOverlay
    ? {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        textAlign: 'center',
      }
    : {
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        boxSizing: 'border-box',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        textAlign: 'center',
        background: 'linear-gradient(160deg, #0a1628 0%, #0a0f1e 100%)',
      }

  const cardStyle = isOverlay
    ? overlayPanelStyle({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        maxWidth: '420px',
        width: '100%',
        padding: '36px 32px',
        backgroundColor: OVERLAY_PANEL_BG_ALT,
        opacity: 1,
        isolation: 'isolate',
        borderRadius: '8px',
      })
    : undefined

  return (
    <div style={page}>
      <div className={isOverlay ? 'obs-overlay-graphic' : undefined} style={cardStyle}>
        <BoardBrandingSlide
          variant={isOverlay ? 'overlay' : 'fullscreen'}
          screenName={screenName}
          statusLine={statusLine}
        />
      </div>
    </div>
  )
}
