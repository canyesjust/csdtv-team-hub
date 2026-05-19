import type { PublicActiveLowerThird } from '@/lib/board-meetings/lower-third-control'
import { overlayPanelStyle, OVERLAY_TEXT_MUTED, OVERLAY_TEXT_PRIMARY } from '@/app/board/overlay-graphics'

type Variant = 'overlay' | 'live'

export default function LowerThirdBanner({
  person,
  variant = 'overlay',
}: {
  person: PublicActiveLowerThird
  variant?: Variant
}) {
  const subtitle = [person.primary_title, person.officer_position, person.affiliation]
    .filter(Boolean)
    .join(' · ')

  const isOverlay = variant === 'overlay'

  const overlayLayout = {
    left: '48px',
    bottom: '10vh',
    gap: '20px',
    padding: '18px 28px',
    maxWidth: 'min(720px, calc(100vw - 96px))',
    borderLeftWidth: 6,
    photoSize: 88,
    nameSize: '36px',
    subtitleSize: '20px',
  } as const

  const liveLayout = {
    left: '32px',
    bottom: '32px',
    gap: '14px',
    padding: '14px 20px',
    maxWidth: 'min(520px, calc(100vw - 64px))',
    borderLeftWidth: 4,
    photoSize: 56,
    nameSize: '22px',
    subtitleSize: '14px',
  } as const

  const layout = isOverlay ? overlayLayout : liveLayout

  return (
    <div
      className={isOverlay ? 'obs-overlay-graphic' : undefined}
      style={{
        position: isOverlay ? 'absolute' : 'fixed',
        left: layout.left,
        bottom: layout.bottom,
        display: 'flex',
        alignItems: 'center',
        gap: layout.gap,
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
      {person.photo_url ? (
        <img
          src={person.photo_url}
          alt=""
          style={{
            width: layout.photoSize,
            height: layout.photoSize,
            borderRadius: isOverlay ? '8px' : '6px',
            objectFit: 'cover',
            flexShrink: 0,
          }}
        />
      ) : null}
      <div>
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
    </div>
  )
}
