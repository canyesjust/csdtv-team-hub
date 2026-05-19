'use client'

import type { ActiveMotion } from '@/lib/board-meetings/motion-types'

type Props = {
  motion: ActiveMotion
  note?: string
}

export default function HeldMotionCard({ motion, note }: Props) {
  return (
    <div style={{
      padding: '10px 14px',
      background: 'var(--surface-1, #131b2e)',
      borderRadius: 8,
      border: '0.5px dashed var(--border-subtle, rgba(255, 255, 255, 0.08))',
      opacity: 0.7,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 10, color: 'var(--text-muted, #6b7385)', letterSpacing: '0.06em',
            padding: '2px 6px',
            border: '0.5px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
            borderRadius: 6,
          }}>
            MAIN · HELD
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted, #6b7385)' }}>
            {motion.mover_name} / {motion.seconder_name}
          </span>
        </div>
        {note && (
          <span style={{ fontSize: 10, color: 'var(--text-muted, #6b7385)' }}>
            ↩ {note}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted, #6b7385)', lineHeight: 1.4 }}>
        {motion.text}
      </div>
    </div>
  )
}
