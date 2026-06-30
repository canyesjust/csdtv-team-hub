'use client'

export default function Loader({ size = 48 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Slate body */}
        <rect x="6" y="20" width="36" height="24" rx="3" fill="var(--brand-primary)" opacity="0.12" stroke="var(--brand-primary)" strokeWidth="1.5"/>
        {/* Text lines on slate */}
        <line x1="12" y1="28" x2="30" y2="28" stroke="var(--brand-primary)" strokeWidth="1.5" opacity="0.25" strokeLinecap="round"/>
        <line x1="12" y1="33" x2="24" y2="33" stroke="var(--brand-primary)" strokeWidth="1.5" opacity="0.18" strokeLinecap="round"/>
        <line x1="12" y1="38" x2="27" y2="38" stroke="var(--brand-primary)" strokeWidth="1.5" opacity="0.12" strokeLinecap="round"/>
        {/* Clapper arm - animated */}
        <g className="csdtv-clapper" style={{ transformOrigin: '6px 20px' }}>
          <rect x="6" y="12" width="36" height="8" rx="2" fill="var(--brand-primary)" opacity="0.25" stroke="var(--brand-primary)" strokeWidth="1.5"/>
          {/* Diagonal stripes */}
          <line x1="14" y1="12" x2="18" y2="20" stroke="var(--brand-primary)" strokeWidth="2" opacity="0.35" strokeLinecap="round"/>
          <line x1="23" y1="12" x2="27" y2="20" stroke="var(--brand-primary)" strokeWidth="2" opacity="0.35" strokeLinecap="round"/>
          <line x1="32" y1="12" x2="36" y2="20" stroke="var(--brand-primary)" strokeWidth="2" opacity="0.35" strokeLinecap="round"/>
        </g>
      </svg>
    </div>
  )
}