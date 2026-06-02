'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Loader from '../../components/Loader'
import MeetingFocusDashboard from './MeetingFocusDashboard'
import {
  isBoardMeetingPast,
  parseProductionInstant,
} from '@/lib/board-meetings/meeting-schedule'

const FOCUS_STORAGE_KEY = 'board-meetings-working-production-id'

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
    agenda_locked_at: string | null
    agenda_extracted_at: string | null
    updated_at: string | null
    scheduled_public_start: string | null
  } | null
}

function districtScheduleIso(row: MeetingRow): string | null {
  return row.start_datetime ?? row.event_date ?? null
}

function meetingInstant(row: MeetingRow): number | null {
  const d = districtScheduleIso(row) ?? row.board_meeting?.scheduled_public_start ?? null
  if (!d) return null
  const t = parseProductionInstant(d).getTime()
  return Number.isNaN(t) ? null : t
}

function isPastMeeting(row: MeetingRow): boolean {
  return isBoardMeetingPast(districtScheduleIso(row))
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

function readStoredFocusId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(FOCUS_STORAGE_KEY)
  } catch {
    return null
  }
}

function storeFocusId(productionId: string) {
  try {
    localStorage.setItem(FOCUS_STORAGE_KEY, productionId)
  } catch {
    /* ignore */
  }
}

function CollapsibleMeetingList({
  title,
  subtitle,
  rows,
  focusedId,
  onSelect,
}: {
  title: string
  subtitle: string
  rows: MeetingRow[]
  focusedId: string
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'

  if (rows.length === 0) return null

  return (
    <section>
      <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
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
            <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: text }}>{title}</span>
            <span style={{ display: 'block', fontSize: '12px', color: muted, marginTop: '2px' }}>{subtitle}</span>
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke={muted}
            strokeWidth="2.5"
            style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0 }}
            aria-hidden
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        {open && (
          <ul style={{ listStyle: 'none', margin: 0, padding: '4px 8px 8px', borderTop: `0.5px solid ${border}` }}>
            {rows.map(r => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onSelect(r.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: r.id === focusedId ? 'var(--surface-2, rgba(0,0,0,0.04))' : 'transparent',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    minHeight: '44px',
                  }}
                >
                  <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: text }}>
                    #{r.production_number} {r.title}
                  </span>
                  <span style={{ display: 'block', fontSize: '12px', color: muted, marginTop: '2px' }}>
                    {r.board_meeting?.broadcast_status ?? 'not started'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default function MeetingsTab() {
  const supabase = createClient()
  const [rows, setRows] = useState<MeetingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{
    board_meeting: {
      agenda_extracted_at: string | null
      agenda_locked: boolean
      agenda_locked_at: string | null
      updated_at: string
      broadcast_status: string
    } | null
    items: {
      id: string
      item_number: string
      title: string
      is_broadcastable: boolean
      needs_review: boolean
      updated_at?: string
    }[]
  } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
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
      .select(
        'production_id, broadcast_status, agenda_locked, agenda_locked_at, scheduled_public_start, agenda_extracted_at, updated_at',
      )
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

  const { upcoming, past, allSorted } = useMemo(() => {
    const upcomingRows: MeetingRow[] = []
    const pastRows: MeetingRow[] = []
    for (const row of rows) {
      if (isPastMeeting(row)) pastRows.push(row)
      else upcomingRows.push(row)
    }
    upcomingRows.sort(sortUpcoming)
    pastRows.sort(sortPast)
    return {
      upcoming: upcomingRows,
      past: pastRows,
      allSorted: [...upcomingRows, ...pastRows],
    }
  }, [rows])

  useEffect(() => {
    if (loading || allSorted.length === 0) {
      setFocusedId(null)
      return
    }
    setFocusedId(prev => {
      if (prev && allSorted.some(r => r.id === prev)) return prev
      const stored = readStoredFocusId()
      return (
        (stored && allSorted.some(r => r.id === stored) ? stored : null) ??
        upcoming[0]?.id ??
        past[0]?.id ??
        null
      )
    })
  }, [loading, allSorted, upcoming, past])

  const setFocus = useCallback((productionId: string) => {
    setFocusedId(productionId)
    storeFocusId(productionId)
  }, [])

  useEffect(() => {
    if (!focusedId) {
      setDetail(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    void fetch(`/api/board-meetings/${focusedId}`)
      .then(async res => {
        const body = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setDetail(null)
          return
        }
        setDetail({ board_meeting: body.board_meeting, items: body.items || [] })
      })
      .catch(() => {
        if (!cancelled) setDetail(null)
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [focusedId])

  const focusedRow = useMemo(
    () => (focusedId ? rows.find(r => r.id === focusedId) ?? null : null),
    [rows, focusedId],
  )

  const otherUpcoming = useMemo(
    () => upcoming.filter(r => r.id !== focusedId),
    [upcoming, focusedId],
  )

  const otherPast = useMemo(() => past.filter(r => r.id !== focusedId), [past, focusedId])

  if (loading) return <Loader />

  if (rows.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: muted, background: cardBg, borderRadius: '12px', border: `0.5px solid ${border}` }}>
        No board meeting productions yet. Create a production with type Board Meeting (request type 4).
      </div>
    )
  }

  if (!focusedRow) {
    return (
      <div style={{ padding: '24px', color: muted, background: cardBg, borderRadius: '12px', border: `0.5px solid ${border}` }}>
        No meeting selected.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <MeetingFocusDashboard row={focusedRow} detail={detail} detailLoading={detailLoading} />

      <CollapsibleMeetingList
        title={`Other upcoming (${otherUpcoming.length})`}
        subtitle={otherUpcoming.length ? 'Switch working meeting' : 'No other upcoming meetings'}
        rows={otherUpcoming}
        focusedId={focusedId!}
        onSelect={setFocus}
      />

      <CollapsibleMeetingList
        title={`Past meetings (${otherPast.length})`}
        subtitle={otherPast.length ? 'Show older meetings' : 'No other past meetings'}
        rows={otherPast}
        focusedId={focusedId!}
        onSelect={setFocus}
      />
    </div>
  )
}
