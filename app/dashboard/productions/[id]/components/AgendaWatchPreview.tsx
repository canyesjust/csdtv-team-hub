'use client'

import { useMemo } from 'react'
import type { AgendaItemUI } from '@/lib/board-meetings/types'

// A lightweight, read-only preview of how the agenda will read on the public
// "Watch Board Meetings" page. It mirrors that page's styling (blue header,
// numbered sections, item rows, a single Consent Agenda bundle) so the operator
// can see what the public sees while editing — no data is changed here.

type Sub = { item_number?: string; title?: string }

function isActionItem(it: AgendaItemUI): boolean {
  return it.type === 'action' || it.action_requested
}

export default function AgendaWatchPreview({ items }: { items: AgendaItemUI[] }) {
  const sections = useMemo(() => {
    const broadcastable = [...items]
      .filter(i => i.is_broadcastable !== false)
      .sort((a, b) => a.sort_order - b.sort_order)
    const order: number[] = []
    const bySection = new Map<number, { title: string; items: AgendaItemUI[] }>()
    for (const it of broadcastable) {
      if (!bySection.has(it.section_number)) {
        bySection.set(it.section_number, { title: it.section_title, items: [] })
        order.push(it.section_number)
      }
      bySection.get(it.section_number)!.items.push(it)
    }
    return order.map(n => ({ number: n, title: bySection.get(n)!.title, items: bySection.get(n)!.items }))
  }, [items])

  const blue = '#065687'
  const slate = 'var(--text-muted)'
  const ink = 'var(--text-primary)'
  const line = 'var(--border-subtle)'
  const card = 'var(--surface-1)'

  return (
    <div style={{ position: 'sticky', top: '16px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: slate, marginBottom: '8px' }}>
        Public website preview
      </div>
      <div style={{ background: card, border: `1px solid ${line}`, borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', background: blue, color: '#fff', fontSize: '13px', fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase' }}>
          Meeting Agenda
        </div>
        <div style={{ maxHeight: '620px', overflowY: 'auto', padding: '4px 0' }}>
          {sections.length === 0 ? (
            <div style={{ padding: '20px 16px', color: slate, fontSize: '13px' }}>
              No broadcastable items yet — items you keep will show here.
            </div>
          ) : (
            sections.map((sec, si) => (
              <div key={sec.number}>
                <div style={{ padding: '12px 16px 4px', display: 'flex', alignItems: 'baseline', gap: '9px' }}>
                  <span style={{ fontWeight: 900, color: '#2791D0', fontSize: '13px', minWidth: '16px' }}>{sec.number}</span>
                  <span style={{ fontWeight: 800, fontSize: '14px', color: ink }}>{sec.title}</span>
                </div>
                {sec.items.map(it => {
                  const consent = !!it.consent_block
                  const subs = (Array.isArray(it.subitems) ? (it.subitems as Sub[]) : []) || []
                  const pres = (it.presenters || [])
                    .map(p => [p.name, p.title].filter(Boolean).join(', '))
                    .filter(Boolean)
                    .join(' and ')
                  return (
                    <div key={it.id || `${it.item_number}-${it.title}`} style={{ padding: '7px 16px 7px 41px', position: 'relative' }}>
                      {!consent && (
                        <span style={{ position: 'absolute', left: '18px', top: '7px', fontWeight: 800, fontSize: '12px', color: slate, width: '16px' }}>
                          {it.item_number}
                        </span>
                      )}
                      <div style={{ fontSize: '14px', fontWeight: 600, color: ink, lineHeight: 1.35 }}>
                        {consent ? 'Consent Agenda' : it.title}
                        {isActionItem(it) && (
                          <span style={{ fontSize: '10px', color: '#9a6a00', background: '#fdebc8', padding: '1px 6px', borderRadius: '5px', marginLeft: '6px', fontWeight: 700 }}>action</span>
                        )}
                      </div>
                      {consent ? (
                        <>
                          <div style={{ fontSize: '12.5px', color: slate, marginTop: '1px' }}>Approved together as one motion</div>
                          {subs.length > 0 && (
                            <div style={{ marginTop: '4px' }}>
                              {subs.map((s, i) => (
                                <div key={i} style={{ fontSize: '12.5px', color: slate, padding: '2px 0', display: 'flex', gap: '7px' }}>
                                  <span style={{ fontWeight: 700, minWidth: '16px' }}>{s.item_number || ''}</span>
                                  <span>{s.title || ''}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {pres && <div style={{ fontSize: '12.5px', color: slate, marginTop: '1px' }}>{pres}</div>}
                          {isActionItem(it) && it.suggested_motion_text?.trim() && (
                            <div style={{ fontSize: '12px', color: slate, marginTop: '3px', fontStyle: 'italic' }}>
                              “{it.suggested_motion_text.trim()}”
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
                {si < sections.length - 1 && <div style={{ height: '1px', background: line, margin: '8px 16px 0' }} />}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
