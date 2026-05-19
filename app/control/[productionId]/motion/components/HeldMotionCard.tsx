'use client'

import type { ActiveMotion } from '@/lib/board-meetings/types'

type Props = {
  motion: ActiveMotion
  note: string
}

export default function HeldMotionCard({ motion, note }: Props) {
  return (
    <div
      style={{
        padding: '12px 14px',
        background: 'var(--surface-2)',
        border: '0.5px solid var(--border-subtle)',
        borderRadius: 12,
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 6 }}>
        HELD MAIN MOTION
      </div>
      <p style={{ margin: '0 0 6px', fontSize: 14, lineHeight: 1.4, color: 'var(--text-primary)' }}>
        {motion.text || '—'}
      </p>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
        {motion.mover_name || '—'} / {motion.seconder_name || '—'} · {note}
      </p>
    </div>
  )
}
