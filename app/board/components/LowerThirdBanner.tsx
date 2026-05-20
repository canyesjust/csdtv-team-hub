import type { LowerThirdPosition, PublicActiveLowerThird } from '@/lib/board-meetings/lower-third-control'
import { overlayPanelStyle, OVERLAY_TEXT_MUTED, OVERLAY_TEXT_PRIMARY } from '@/app/board/overlay-graphics'

type Variant = 'overlay' | 'live'

function horizontalPlacement(position: LowerThirdPosition, isOverlay: boolean) {
  const inset = isOverlay ? '48px' : '32px'
  if (position === 'center') {
    return { left: '50%', right: 'auto' as const, transform: 'translateX(-50%)' }
  }
  if (position === 'right') {
    return { left: 'auto' as const, right: inset, transform: 'none' }
  }
  return { left: inset, right: 'auto' as const, transform: 'none' }
}

export default function LowerThirdBanner({
  person,
  variant = 'overlay',
  position = 'left',
}: {
  person: PublicActiveLowerThird
  variant?: Variant
  position?: LowerThirdPosition
}) {
  const subtitle = [person.primary_title, person.officer_position, person.affiliation]
    .filter(Boolean)
    .join(' · ')

  const isOverlay = variant === 'overlay'

  const overlayLayout = {
    bottom: '10vh',
    padding: '18px 28px',
    maxWidth: 'min(720px, calc(100vw - 96px))',
    borderLeftWidth: 6,
    nameSize: '36px',
    subtitleSize: '20px',
  } as const

  const liveLayout = {
    bottom: '32px',
    padding: '14px 20px',
    maxWidth: 'min(520px, calc(100vw - 64px))',
    borderLeftWidth: 4,
    nameSize: '22px',
    subtitleSize: '14px',
  } as const

  const layout = isOverlay ? overlayLayout : liveLayout
  const placement = horizontalPlacement(position, isOverlay)

  return (
    <div
      className={isOverlay ? 'obs-overlay-graphic' : undefined}
      style={{
        position: isOverlay ? 'absolute' : 'fixed',
        ...placement,
        bottom: layout.bottom,
        maxWidth: layout.maxWidth,
        padding: layout.padding,
        borderRadius: isOverlay ? '10px' : '8px',
        ...(isOverlay
          ? overlayPanelStyle({
              borderLeft: `${layout.borderLeftWidth}px solid #3b82f6`,
              color: OVERLAY_TEXT_PRIMARY,
              boxShadow: '0 4px 0 #000',
            })
          : {
              background: 'rgba(255, 255, 255, 0.96)',
              borderLeft: `${layout.borderLeftWidth}px solid #1e6cb5`,
              color: '#0f172a',
              boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            }),
        zIndex: 50,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <p style={{ margin: 0, fontSize: layout.nameSize, fontWeight: 700, lineHeight: 1.15 }}>{person.display_name}</p>
      {subtitle ? (
        <p
          style={{
            margin: '6px 0 0',
            fontSize: layout.subtitleSize,
            color: isOverlay ? OVERLAY_TEXT_MUTED : undefined,
            opacity: isOverlay ? 1 : 0.9,
            lineHeight: 1.35,
          }}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  )
}
