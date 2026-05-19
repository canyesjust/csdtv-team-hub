import type { PublicActiveLowerThird } from '@/lib/board-meetings/lower-third-control'

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

  return (
    <div
      style={{
        position: isOverlay ? 'absolute' : 'fixed',
        left: '32px',
        bottom: '32px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        maxWidth: 'min(520px, calc(100vw - 64px))',
        padding: isOverlay ? '12px 18px' : '14px 20px',
        borderRadius: '8px',
        background: isOverlay ? 'rgba(10, 15, 30, 0.92)' : 'rgba(255, 255, 255, 0.96)',
        borderLeft: `4px solid ${isOverlay ? '#3b82f6' : '#1e6cb5'}`,
        color: isOverlay ? '#f0f4ff' : '#0f172a',
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        zIndex: 50,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {person.photo_url ? (
        <img
          src={person.photo_url}
          alt=""
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '6px',
            objectFit: 'cover',
            flexShrink: 0,
          }}
        />
      ) : null}
      <div>
        <p style={{ margin: 0, fontSize: '22px', fontWeight: 700, lineHeight: 1.2 }}>{person.display_name}</p>
        {subtitle ? (
          <p style={{ margin: '4px 0 0', fontSize: '14px', opacity: 0.88, lineHeight: 1.35 }}>{subtitle}</p>
        ) : null}
      </div>
    </div>
  )
}
