'use client'

import Link from 'next/link'

export default function MotionContextBar({
  productionId,
  itemLabel,
  statusLabel,
}: {
  productionId: string
  itemLabel: string | null
  statusLabel: string
}) {
  return (
    <div className="ms-context">
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
        {itemLabel ? `Agenda: ${itemLabel}` : 'No agenda item selected'}
        {' · '}
        <strong style={{ color: 'var(--text-primary)' }}>{statusLabel}</strong>
      </p>
      <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
        Minimizing returns to the control surface without canceling this motion.
      </p>
      <Link href={`/control/${productionId}`} style={{ fontSize: 13, color: 'var(--brand-primary)' }}>
        ← Back to control surface
      </Link>
    </div>
  )
}
