'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import Loader from '../../components/Loader'

type MeetingRow = {
  id: string
  production_number: number
  title: string
  start_datetime: string | null
  event_date: string | null
  status: string | null
  board_meeting?: {
    broadcast_status: string
    agenda_locked: boolean
    scheduled_public_start: string | null
  } | null
}

/** Board meetings often only have schedule on board_meetings, not productions.start_datetime. */
function meetingDateIso(row: MeetingRow): string | null {
  return (
    row.start_datetime ??
    row.board_meeting?.scheduled_public_start ??
    row.event_date ??
    null
  )
}

function parseProductionInstant(iso: string): Date {
  const raw = iso.includes('T') ? iso : iso.replace(' ', 'T')
  return new Date(raw)
}

/** Whole calendar days from local today (0 = today, -1 = yesterday). Ignores clock time within the day. */
function daysFromToday(d: string | null): number | null {
  if (!d) return null
  const event = parseProductionInstant(d)
  if (Number.isNaN(event.getTime())) return null
  const eventDay = new Date(event.getFullYear(), event.getMonth(), event.getDate())
  const today = new Date()
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((eventDay.getTime() - todayDay.getTime()) / 86400000)
}

function meetingInstant(row: MeetingRow): number | null {
  const d = meetingDateIso(row)
  if (!d) return null
  const t = parseProductionInstant(d).getTime()
  return Number.isNaN(t) ? null : t
}

function isPastMeeting(row: MeetingRow): boolean {
  const ts = meetingInstant(row)
  if (ts !== null) return ts < Date.now()
  return false
}

function sortUpcoming(a: MeetingRow, b: MeetingRow): number {
  const aTs = meetingInstant(a)
  const bTs = meetingInstant(b)
  if (aTs === null && bTs === null) return b.production_number - a.production_number
  if (aTs === null) return 1
  if (bTs === null) return -1
  if (aTs !== bTs) return aTs - bTs
  return b.production_number - a.production_number
}

function sortPast(a: MeetingRow, b: MeetingRow): number {
  const aTs = meetingInstant(a)
  const bTs = meetingInstant(b)
  if (aTs === null && bTs === null) return b.production_number - a.production_number
  if (aTs === null) return 1
  if (bTs === null) return -1
  if (aTs !== bTs) return bTs - aTs
  return b.production_number - a.production_number
}

export default function MeetingsTab() {
  const supabase = createClient()
  const [rows, setRows] = useState<MeetingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [pastExpanded, setPastExpanded] = useState(false)
  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'

  const load = useCallback(async () => {
    const { data: prods, error: prodErr } = await supabase
      .from('productions')
      .select('id, production_number, title, start_datetime, event_date, status')
      .eq('request_type_number', 4)

    if (prodErr) {
      console.error(prodErr)
      setRows([])
      setLoading(false)
      return
    }

    const list = prods || []
    if (list.length === 0) {
      setRows([])
      setLoading(false)
      return
    }

    const ids = list.map(p => p.id)
    const { data: bms } = await supabase
      .from('board_meetings')
      .select('production_id, broadcast_status, agenda_locked, scheduled_public_start')
      .in('production_id', ids)

    const bmByProd = new Map((bms || []).map(b => [b.production_id, b]))
    setRows(
      list.map(p => ({
        ...p,
        board_meeting: bmByProd.get(p.id) || null,
      })),
    )
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const { upcoming, past } = useMemo(() => {
    const upcomingRows: MeetingRow[] = []
    const pastRows: MeetingRow[] = []
    for (const row of rows) {
      if (isPastMeeting(row)) pastRows.push(row)
      else upcomingRows.push(row)
    }
    upcomingRows.sort(sortUpcoming)
    pastRows.sort(sortPast)
    return { upcoming: upcomingRows, past: pastRows }
  }, [rows])

  if (loading) return <Loader />

  if (rows.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: muted, background: cardBg, borderRadius: '12px', border: `0.5px solid ${border}` }}>
        No board meeting productions yet. Create a production with type Board Meeting (request type 4).
      </div>
    )
  }

  const meetingCard = (r: MeetingRow) => (
    <div
      key={r.id}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '14px 16px',
        background: cardBg,
        border: `0.5px solid ${border}`,
        borderRadius: '10px',
        minHeight: '44px',
      }}
    >
      <Link href={`/dashboard/productions/${r.production_number}?tab=boardmeeting`} style={{ flex: 1, textDecoration: 'none', color: text }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '15px' }}>#{r.production_number} {r.title}</div>
          <div style={{ fontSize: '13px', color: muted, marginTop: '4px' }}>
            {(() => {
              const when = meetingDateIso(r)
              if (!when) return 'Date TBD'
              const dt = parseProductionInstant(when)
              const dateLabel = dt.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
              const hasTime = when.includes('T') || /\d{2}:\d{2}/.test(when)
              const timeLabel = hasTime
                ? dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                : null
              return timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel
            })()}
            {r.board_meeting ? ` · ${r.board_meeting.broadcast_status}${r.board_meeting.agenda_locked ? ' · agenda locked' : ''}` : ' · not started'}
          </div>
        </div>
      </Link>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
        {r.board_meeting && ['prepared', 'live'].includes(r.board_meeting.broadcast_status) && (
          <Link
            href={`/control/${r.id}`}
            style={{ fontSize: '12px', color: 'var(--brand-primary)', textDecoration: 'none', fontWeight: 600 }}
          >
            Control →
          </Link>
        )}
        {r.board_meeting?.broadcast_status === 'archived' && (
          <Link
            href={`/board/meeting/${r.production_number}/archive`}
            target="_blank"
            style={{ fontSize: '12px', color: 'var(--brand-primary)', textDecoration: 'none', fontWeight: 600 }}
          >
            Archive →
          </Link>
        )}
        <Link href={`/dashboard/productions/${r.production_number}?tab=boardmeeting`} style={{ fontSize: '13px', color: 'var(--brand-primary)', textDecoration: 'none' }}>
          Open →
        </Link>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {upcoming.length === 0 && past.length > 0 && (
        <div style={{ padding: '12px 16px', fontSize: '13px', color: muted, background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px' }}>
          No upcoming board meetings.
        </div>
      )}
      {upcoming.map(meetingCard)}
      {past.length > 0 && (
        <section style={{ marginTop: upcoming.length > 0 ? '4px' : 0 }}>
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setPastExpanded(v => !v)}
              aria-expanded={pastExpanded}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                padding: '12px 16px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: text }}>
                  Past meetings ({past.length})
                </span>
                <span style={{ display: 'block', fontSize: '12px', color: muted, marginTop: '2px', lineHeight: 1.35 }}>
                  {pastExpanded ? 'Hide older meetings' : 'Show past meetings'}
                </span>
              </span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke={muted}
                strokeWidth="2.5"
                style={{ transform: pastExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0 }}
                aria-hidden
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            {pastExpanded && (
              <div style={{ borderTop: `0.5px solid ${border}`, padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {past.map(meetingCard)}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
