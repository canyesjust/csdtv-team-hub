'use client'

import Link from 'next/link'
import type { GroupedChecklist } from '@/lib/onboarding/checklist-utils'
import type { OnboardingItemInstance } from '@/lib/onboarding/types'

type Props = {
  grouped: GroupedChecklist
  canEdit: boolean
  onToggle?: (item: OnboardingItemInstance) => void
  text: string
  muted: string
  border: string
  cardBg: string
}

export default function OnboardingChecklist({
  grouped,
  canEdit,
  onToggle,
  text,
  muted,
  border,
  cardBg,
}: Props) {
  if (grouped.length === 0) {
    return (
      <p style={{ fontSize: '14px', color: muted, textAlign: 'center', padding: '32px 16px' }}>
        No checklist items yet.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {grouped.map(({ phase, categories }) => (
        <section key={phase.id}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: text, margin: '0 0 12px' }}>
            {phase.label}
          </h2>
          {categories.map(({ category, items }) => (
            <div key={category.id} style={{ marginBottom: '16px' }}>
              <p
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.6px',
                  textTransform: 'uppercase',
                  color: muted,
                  margin: '0 0 8px',
                }}
              >
                {category.label}
              </p>
              <div
                style={{
                  background: cardBg,
                  border: `0.5px solid ${border}`,
                  borderRadius: '12px',
                  overflow: 'hidden',
                }}
              >
                {items.map((task, i) => (
                  <div
                    key={task.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '12px 16px',
                      borderBottom: i < items.length - 1 ? `0.5px solid ${border}` : 'none',
                      background: task.completed ? 'rgba(34,197,94,0.04)' : 'transparent',
                    }}
                  >
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => onToggle?.(task)}
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '4px',
                        border: `1.5px solid ${task.completed ? '#22c55e' : border}`,
                        background: task.completed ? '#22c55e' : 'transparent',
                        cursor: canEdit ? 'pointer' : 'default',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: '2px',
                        opacity: canEdit ? 1 : 0.7,
                      }}
                    >
                      {task.completed && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: '15px',
                          fontWeight: 500,
                          color: task.completed ? muted : text,
                          margin: 0,
                          textDecoration: task.completed ? 'line-through' : 'none',
                        }}
                      >
                        {task.title}
                        {!task.required && (
                          <span style={{ fontSize: '11px', color: muted, marginLeft: '6px' }}>optional</span>
                        )}
                      </p>
                      {task.description && (
                        <p style={{ fontSize: '13px', color: muted, margin: '3px 0 0', lineHeight: 1.5 }}>
                          {task.description}
                        </p>
                      )}
                      {task.library_article_id && (
                        <Link
                          href={`/dashboard/library?tab=articles&article=${task.library_article_id}`}
                          style={{
                            display: 'inline-block',
                            marginTop: '6px',
                            fontSize: '13px',
                            fontWeight: 500,
                            color: '#5ba3e0',
                            textDecoration: 'none',
                          }}
                        >
                          Open in Library →
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
