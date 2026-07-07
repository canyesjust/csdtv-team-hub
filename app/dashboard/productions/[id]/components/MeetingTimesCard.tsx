'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from '@/lib/toast'
import type { AgendaItemUI } from '@/lib/board-meetings/types'
import { formatStartLabel } from '@/lib/board-meetings/public-start-times'

type StartTimes = { meeting: string | null; sections: Record<string, string> }

/**
 * Set the public start times shown on the "Watch Board Meetings Live" page:
 * one overall meeting start (replaces the old hardcoded 7:00 p.m.) plus an
 * optional time-certain start per agenda section (e.g. Closed 5:00, Study 5:15,
 * Business 7:00). Saved to board_meetings.public_start_times. Times are local
 * wall-clock — no timezone math, they display exactly as entered.
 */
export default function MeetingTimesCard({
  productionId,
  items,
  initial,
  onSaved,
}: {
  productionId: string
  items: AgendaItemUI[]
  initial?: StartTimes | null
  onSaved?: (value: StartTimes) => void
}) {
  const [meeting, setMeeting] = useState<string>(initial?.meeting || '')
  const [sections, setSections] = useState<Record<string, string>>(initial?.sections || {})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setMeeting(initial?.meeting || '')
    setSections(initial?.sections || {})
  }, [initial])

  // Distinct agenda sections in agenda order (number + title).
  const sectionList = useMemo(() => {
    const order: number[] = []
    const titleByNum = new Map<number, string>()
    for (const it of [...items].sort((a, b) => a.sort_order - b.sort_order)) {
      if (!titleByNum.has(it.section_number)) {
        titleByNum.set(it.section_number, it.section_title)
        order.push(it.section_number)
      }
    }
    return order.map(n => ({ number: n, title: titleByNum.get(n) || '' }))
  }, [items])

  const save = async (next: StartTimes) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/board-meetings/${productionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_start_times: next }),
      })
      const body = await res.json()
      if (!res.ok) {
        toast(body.error || 'Could not save meeting times', 'error')
        return
      }
      const saved: StartTimes = body.board_meeting?.public_start_times || { meeting: null, sections: {} }
      onSaved?.(saved)
      toast('Meeting times saved', 'success')
    } finally {
      setSaving(false)
    }
  }

  const buildPayload = (m: string, s: Record<string, string>): StartTimes => {
    const cleanSections: Record<string, string> = {}
    for (const [k, v] of Object.entries(s)) if (v) cleanSections[k] = v
    return { meeting: m || null, sections: cleanSections }
  }

  const saveMeeting = (value: string) => {
    setMeeting(value)
    void save(buildPayload(value, sections))
  }

  const saveSection = (num: number, value: string) => {
    const next = { ...sections }
    if (value) next[String(num)] = value
    else delete next[String(num)]
    setSections(next)
    void save(buildPayload(meeting, next))
  }

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'

  const timeInput: React.CSSProperties = {
    minHeight: '40px',
    padding: '8px 10px',
    borderRadius: '8px',
    border: `0.5px solid ${border}`,
    background: 'var(--surface-2)',
    color: text,
    fontFamily: 'inherit',
    fontSize: '14px',
    width: '130px',
    boxSizing: 'border-box',
  }

  // What the public page will show as the overall start: the explicit meeting
  // time, else the earliest section time.
  const effectiveStart =
    meeting ||
    Object.values(sections).sort()[0] ||
    ''

  return (
    <div style={{ marginBottom: '16px', padding: '14px 16px', background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px' }}>
      <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600, color: text }}>Public start times</p>
      <p style={{ margin: '0 0 12px', fontSize: '13px', color: muted, lineHeight: 1.45 }}>
        Sets when the public &ldquo;Watch Board Meetings Live&rdquo; page says the meeting starts. Leave a
        field blank to hide it. If you leave the meeting start blank, the earliest section time is used.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: sectionList.length ? '14px' : 0 }}>
        <label style={{ fontSize: '13px', fontWeight: 600, color: text, minWidth: '110px' }}>Meeting start</label>
        <input
          type="time"
          value={meeting}
          onChange={e => setMeeting(e.target.value)}
          onBlur={e => saveMeeting(e.target.value)}
          style={timeInput}
        />
        {effectiveStart && (
          <span style={{ fontSize: '12.5px', color: muted }}>
            Shows as <strong style={{ color: text, fontWeight: 600 }}>{formatStartLabel(effectiveStart)}</strong>
          </span>
        )}
      </div>

      {sectionList.length > 0 && (
        <div>
          <p style={{ margin: '0 0 6px', fontSize: '12px', fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Time certain by section (optional)
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sectionList.map(sec => (
              <div key={sec.number} style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', color: text, flex: 1, minWidth: '160px' }}>
                  <span style={{ fontWeight: 700, color: muted, marginRight: '6px' }}>{sec.number}</span>
                  {sec.title}
                </span>
                <input
                  type="time"
                  value={sections[String(sec.number)] || ''}
                  onChange={e => setSections(s => ({ ...s, [String(sec.number)]: e.target.value }))}
                  onBlur={e => saveSection(sec.number, e.target.value)}
                  style={timeInput}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {saving && <p style={{ margin: '10px 0 0', fontSize: '12px', color: muted }}>Saving…</p>}
    </div>
  )
}
