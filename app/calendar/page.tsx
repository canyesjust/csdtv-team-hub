'use client'

import { Suspense, useEffect, useMemo, useState, useCallback, type ChangeEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type CalCategory = 'athletics' | 'arts' | 'academics' | 'closures'

type SchoolOption = {
  id: string
  name: string
  primary_color: string | null
}

type CalEvent = {
  id: string
  schoolId: string
  schoolName: string
  title: string
  start: Date
  end: Date | null
  location: string | null
  description: string | null
  category: CalCategory
  isStreaming: boolean
  streamUrl: string | null
}

const CATEGORIES: { key: CalCategory; label: string }[] = [
  { key: 'athletics', label: 'Athletics' },
  { key: 'arts', label: 'Arts' },
  { key: 'academics', label: 'Academics' },
  { key: 'closures', label: 'Closures & Announcements' },
]
const CAT_LABEL: Record<CalCategory, string> = Object.fromEntries(CATEGORIES.map(c => [c.key, c.label])) as Record<CalCategory, string>

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MAX_VISIBLE_PER_CELL = 3
const WEEK_MAX_VISIBLE = 6

function sameDay(a: Date, y: number, m: number, d: number): boolean {
  return a.getFullYear() === y && a.getMonth() === m && a.getDate() === d
}

function startOfWeek(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  c.setDate(c.getDate() - c.getDay())
  return c
}

function fmtTime(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d)
}

function fmtDateLong(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)
}

/** Live only while the event's actual window is in progress; otherwise "streaming" if it's a future/ongoing stream. Text carries the meaning, not color alone. */
function streamState(e: CalEvent, now: Date): 'live' | 'upcoming' | null {
  if (!e.isStreaming) return null
  const end = e.end || new Date(e.start.getTime() + 2 * 3600 * 1000)
  if (now >= e.start && now <= end) return 'live'
  if (now < e.start) return 'upcoming'
  return null
}

function StreamTag({ state }: { state: 'live' | 'upcoming' | null }) {
  if (!state) return null
  if (state === 'live') {
    return (
      <span style={{ color: '#dc2626', fontWeight: 800, fontSize: '0.85em', letterSpacing: '0.02em', whiteSpace: 'nowrap' as const }}>
        <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#dc2626', marginRight: 3 }} />
        LIVE NOW{' '}
      </span>
    )
  }
  return <span style={{ color: '#9a6208', fontWeight: 800, fontSize: '0.85em', letterSpacing: '0.02em', whiteSpace: 'nowrap' as const }}>STREAMING </span>
}

function downloadIcs(e: CalEvent) {
  const end = e.end || new Date(e.start.getTime() + 2 * 3600 * 1000)
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Canyons School District//Events Calendar//EN', 'BEGIN:VEVENT',
    `UID:${e.id}@csdtv-team-hub`, `DTSTART:${fmt(e.start)}`, `DTEND:${fmt(end)}`,
    `SUMMARY:${e.title.replace(/\r?\n/g, ' ')}`,
    e.location ? `LOCATION:${e.location.replace(/\r?\n/g, ' ')}` : '',
    e.description ? `DESCRIPTION:${e.description.replace(/\r?\n/g, ' ')}` : '',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')
  const blob = new Blob([lines], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = e.title.replace(/[^a-z0-9]+/gi, '_') + '.ics'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function EventRow({ e, now, dense, onClick }: { e: CalEvent; now: Date; dense?: boolean; onClick: () => void }) {
  const state = streamState(e, now)
  return (
    <div onClick={onClick} style={{ padding: dense ? '1.5px 3px' : '6px 3px', borderRadius: dense ? 4 : 0, cursor: 'pointer' }}>
      <span style={{ display: 'block', fontSize: dense ? '10.5px' : '12px', fontWeight: dense ? 400 : 700, color: '#18181b', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
        {!dense && <span style={{ display: 'block' }}>{e.schoolName}</span>}
        <StreamTag state={state} />{e.title}
      </span>
      {!dense && (
        <>
          <span style={{ display: 'block', fontSize: '10px', color: '#a1a1aa', marginTop: 1 }}>{fmtTime(e.start)}{e.location ? ` · ${e.location}` : ''}</span>
        </>
      )}
    </div>
  )
}

function AgendaRow({ e, now, onClick }: { e: CalEvent; now: Date; onClick: () => void }) {
  const state = streamState(e, now)
  return (
    <div onClick={onClick} style={{ display: 'block', padding: '10px 10px', borderRadius: 8, cursor: 'pointer', borderBottom: '1px solid #e4e4e7' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#18181b' }}>{e.schoolName}</div>
      <div style={{ fontSize: 12.5, color: '#71717a', marginTop: 1 }}><StreamTag state={state} />{e.title}</div>
      <div style={{ fontSize: 11.5, color: '#a1a1aa', marginTop: 1 }}>{fmtDateLong(e.start)} · {fmtTime(e.start)}{e.location ? ` · ${e.location}` : ''}</div>
    </div>
  )
}

function MonthDayCell({
  day, monthEvents, isToday, isEmpty, now, onDayClick, onEventClick,
}: {
  day: number
  monthEvents: CalEvent[]
  isToday: boolean
  isEmpty: boolean
  now: Date
  onDayClick: () => void
  onEventClick: (e: CalEvent) => void
}) {
  if (isEmpty) return <div className="pc-day-cell" style={{ height: 104, background: '#fafafa' }} />
  const visible = monthEvents.slice(0, MAX_VISIBLE_PER_CELL)
  const extra = monthEvents.length - visible.length
  return (
    <div
      onClick={monthEvents.length > 0 ? onDayClick : undefined}
      className="pc-day-cell"
      style={{
        height: 104, background: '#fff', padding: '5px 6px', display: 'flex', flexDirection: 'column', gap: 1,
        overflow: 'hidden', position: 'relative', cursor: monthEvents.length > 0 ? 'pointer' : 'default',
      }}
    >
      <div style={isToday
        ? { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 19, height: 19, borderRadius: '50%', background: '#2791D0', color: '#fff', fontWeight: 700, fontSize: 11, marginBottom: 3 }
        : { fontSize: 11, color: '#71717a', fontWeight: 600, marginBottom: 3 }
      }>{day}</div>
      <div className="pc-day-cell-rows">
        {visible.map(e => <EventRow key={e.id} e={e} now={now} dense onClick={() => onEventClick(e)} />)}
        {extra > 0 && <div style={{ fontSize: 10.5, fontWeight: 700, color: '#065687', padding: '1.5px 3px', marginTop: 'auto' }}>+{extra} more</div>}
      </div>
      {monthEvents.length > 0 && (
        <div className="pc-day-cell-count" style={{ display: 'none', fontSize: 9, fontWeight: 700, color: '#065687', marginTop: 'auto' }}>{monthEvents.length}</div>
      )}
    </div>
  )
}

export default function PublicCalendarPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#fafafa' }} />}>
      <PublicCalendarInner />
    </Suspense>
  )
}

function PublicCalendarInner() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [now] = useState(() => new Date())
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<CalEvent[]>([])
  const [schools, setSchools] = useState<SchoolOption[]>([])

  const [search, setSearch] = useState('')
  const [schoolFilter, setSchoolFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [view, setView] = useState<'month' | 'list'>('month')

  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth0, setViewMonth0] = useState(now.getMonth())
  const [selectedWeekDayIndex, setSelectedWeekDayIndex] = useState(now.getDay())

  const [dayModal, setDayModal] = useState<{ y: number; m: number; d: number } | null>(null)
  const [eventModalId, setEventModalId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [{ data: schoolRows }, { data: eventRows }] = await Promise.all([
      supabase.from('schools')
        .select('id, name, primary_color')
        .eq('active', true)
        .or('type.eq.school,name.eq.Board of Education,name.eq.Canyons School District')
        .order('name'),
      supabase.from('calendar_school_events')
        .select('id, school_id, title, start_time, end_time, location, description, category, is_streaming, stream_url')
        .eq('status', 'visible')
        .order('start_time', { ascending: true }),
    ])

    const schoolList: SchoolOption[] = schoolRows || []
    setSchools(schoolList)
    const schoolMap = new Map(schoolList.map(s => [s.id, s]))

    const mapped: CalEvent[] = (eventRows || []).map((e: Record<string, unknown>) => ({
      id: e.id as string,
      schoolId: e.school_id as string,
      schoolName: schoolMap.get(e.school_id as string)?.name || 'Canyons School District',
      title: e.title as string,
      start: new Date(e.start_time as string),
      end: e.end_time ? new Date(e.end_time as string) : null,
      location: (e.location as string) || null,
      description: (e.description as string) || null,
      category: (e.category as CalCategory) || 'academics',
      isStreaming: !!e.is_streaming,
      streamUrl: (e.stream_url as string) || null,
    }))
    setEvents(mapped)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Deep link: ?event=<id> opens that event's modal once data has loaded.
  useEffect(() => {
    const id = searchParams.get('event')
    if (id && events.some(e => e.id === id)) setEventModalId(id)
  }, [searchParams, events])

  function openEvent(e: CalEvent) {
    setEventModalId(e.id)
    setDayModal(null)
    router.replace(`/calendar?event=${e.id}`, { scroll: false })
  }
  function closeEventModal() {
    setEventModalId(null)
    setCopied(false)
    router.replace('/calendar', { scroll: false })
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return events.filter(e =>
      (!schoolFilter || e.schoolId === schoolFilter)
      && (!categoryFilter || e.category === categoryFilter)
      && (!q || e.title.toLowerCase().includes(q) || e.schoolName.toLowerCase().includes(q))
    )
  }, [events, search, schoolFilter, categoryFilter])

  const eventModal = eventModalId ? events.find(e => e.id === eventModalId) || null : null

  const weekStart = useMemo(() => startOfWeek(now), [now])
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)
      const dayEvents = filtered.filter(e => sameDay(e.start, d.getFullYear(), d.getMonth(), d.getDate()))
      return { d, dayEvents }
    })
  }, [weekStart, filtered])

  const monthLabel = `${MONTH_NAMES[viewMonth0]} ${viewYear}`
  const daysInMonth = new Date(viewYear, viewMonth0 + 1, 0).getDate()
  const firstDayIndex = new Date(viewYear, viewMonth0, 1).getDay()
  const monthEventsThisMonth = filtered.filter(e => e.start.getFullYear() === viewYear && e.start.getMonth() === viewMonth0)
  const distinctSchoolsThisMonth = new Set(monthEventsThisMonth.map(e => e.schoolId)).size

  const dayModalEvents = dayModal
    ? filtered.filter(e => sameDay(e.start, dayModal.y, dayModal.m, dayModal.d))
    : []

  const eventState = eventModal ? streamState(eventModal, now) : null

  return (
    <div style={{ margin: 0, background: '#fafafa', color: '#18181b', fontFamily: '-apple-system, BlinkMacSystemFont, Inter, "Segoe UI", Helvetica, Arial, sans-serif', fontSize: '14.5px', lineHeight: 1.5, minHeight: '100vh' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #e4e4e7', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 700, fontSize: '14.5px', letterSpacing: '-0.01em' }}>
          <span style={{ width: 26, height: 26, borderRadius: 7, background: '#065687', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>C</span>
          CSDtv <span style={{ color: '#71717a', fontWeight: 500 }}>&nbsp;/ District Calendar</span>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '30px 32px 8px' }}>
        <h1 style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-0.015em', margin: '0 0 8px' }}>Canyons School District Events Calendar</h1>
        <p style={{ fontSize: '14.5px', color: '#71717a', margin: '0 0 4px', maxWidth: 700, lineHeight: 1.6 }}>
          A collection of events happening across Canyons School District — games, concerts, meetings, assemblies, and more — gathered from schools throughout the district. Look for{' '}
          <span style={{ color: '#dc2626', fontWeight: 800, fontSize: '0.85em' }}>LIVE NOW</span> or{' '}
          <span style={{ color: '#9a6208', fontWeight: 800, fontSize: '0.85em' }}>STREAMING</span> next to an event to know CSDtv is broadcasting it.
        </p>
        <p style={{ fontSize: 12.5, color: '#a1a1aa', marginTop: 10 }}>
          {loading ? 'Loading…' : `${monthEventsThisMonth.length} event${monthEventsThisMonth.length === 1 ? '' : 's'} this month across ${distinctSchoolsThisMonth} school${distinctSchoolsThisMonth === 1 ? '' : 's'}.`}
        </p>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 32px 90px' }}>
        <div className="pc-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, marginBottom: 20 }}>
          <input
            value={search}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            placeholder="Search events..."
            style={{ background: '#fff', border: '1px solid #d4d4d8', color: '#18181b', borderRadius: 8, padding: '0 12px', height: 36, fontSize: '13.5px', fontFamily: 'inherit', flex: 1, minWidth: 190 }}
          />
          <select
            value={schoolFilter}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setSchoolFilter(e.target.value)}
            style={{ background: '#fff', border: '1px solid #d4d4d8', color: '#18181b', borderRadius: 8, padding: '0 12px', height: 36, fontSize: '13.5px', fontFamily: 'inherit', minWidth: 170 }}
          >
            <option value="">All {schools.length} schools</option>
            {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select
            value={categoryFilter}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setCategoryFilter(e.target.value)}
            style={{ background: '#fff', border: '1px solid #d4d4d8', color: '#18181b', borderRadius: 8, padding: '0 12px', height: 36, fontSize: '13.5px', fontFamily: 'inherit', minWidth: 170 }}
          >
            <option value="">All categories</option>
            {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <div style={{ display: 'inline-flex', background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: 8, padding: 2, gap: 2 }}>
            <button onClick={() => setView('month')} style={{
              background: view === 'month' ? '#fff' : 'none', boxShadow: view === 'month' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              border: 'none', color: view === 'month' ? '#18181b' : '#71717a', fontSize: '12.5px', fontWeight: 600, padding: '7px 13px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
            }}>Month</button>
            <button onClick={() => setView('list')} style={{
              background: view === 'list' ? '#fff' : 'none', boxShadow: view === 'list' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              border: 'none', color: view === 'list' ? '#18181b' : '#71717a', fontSize: '12.5px', fontWeight: 600, padding: '7px 13px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
            }}>List</button>
          </div>
        </div>

        <div style={{ marginBottom: 22 }}>
          <h2 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#71717a', margin: '0 0 12px' }}>This week</h2>

          <div className="pc-week-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: '#e4e4e7', border: '1px solid #e4e4e7', borderRadius: 10, overflow: 'hidden' }}>
            {weekDays.map(({ d, dayEvents }, i) => {
              const isToday = sameDay(now, d.getFullYear(), d.getMonth(), d.getDate())
              const visible = dayEvents.slice(0, WEEK_MAX_VISIBLE)
              const extra = dayEvents.length - visible.length
              return (
                <div key={i} style={{ background: isToday ? '#eff6ff' : '#fff', minHeight: 230, padding: '10px 9px', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: '#a1a1aa' }}>{DOW[i]}</span>
                    <span style={isToday
                      ? { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 21, height: 21, borderRadius: '50%', background: '#2791D0', color: '#fff', fontSize: 14, fontWeight: 700 }
                      : { fontSize: 14, fontWeight: 700, color: '#18181b' }
                    }>{d.getDate()}</span>
                  </div>
                  {visible.map(e => <EventRow key={e.id} e={e} now={now} onClick={() => openEvent(e)} />)}
                  {extra > 0 && (
                    <div onClick={() => setDayModal({ y: d.getFullYear(), m: d.getMonth(), d: d.getDate() })} style={{ fontSize: 11, fontWeight: 700, color: '#065687', padding: '5px 3px 2px', cursor: 'pointer' }}>+{extra} more</div>
                  )}
                  {dayEvents.length === 0 && <div style={{ fontSize: 11, color: '#a1a1aa', padding: '4px 3px' }}>No events</div>}
                </div>
              )
            })}
          </div>

          <div className="pc-week-daystrip" style={{ display: 'none', gap: 8, overflowX: 'auto' as const, paddingBottom: 4, marginBottom: 12 }}>
            {weekDays.map(({ d, dayEvents }, i) => {
              const isToday = sameDay(now, d.getFullYear(), d.getMonth(), d.getDate())
              const active = i === selectedWeekDayIndex
              return (
                <div key={i} onClick={() => setSelectedWeekDayIndex(i)} style={{
                  flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 12px',
                  borderRadius: 10, border: `1px solid ${active ? '#065687' : '#e4e4e7'}`, background: active ? '#065687' : '#fff', cursor: 'pointer', minWidth: 46,
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, color: active ? '#fff' : '#a1a1aa' }}>{DOW[i]}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: active ? '#fff' : (isToday ? '#2791D0' : '#18181b') }}>{d.getDate()}</span>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: active ? '#fff' : '#2791D0', marginTop: 1, visibility: dayEvents.length ? 'visible' : 'hidden' }} />
                </div>
              )
            })}
          </div>
          <div className="pc-week-single-day" style={{ display: 'none', background: '#fff', border: '1px solid #e4e4e7', borderRadius: 10, padding: '4px 12px' }}>
            {(() => {
              const { dayEvents } = weekDays[selectedWeekDayIndex]
              if (dayEvents.length === 0) return <div style={{ fontSize: 11, color: '#a1a1aa', padding: '10px 0' }}>No events</div>
              return dayEvents.map(e => <EventRow key={e.id} e={e} now={now} onClick={() => openEvent(e)} />)
            })()}
          </div>
        </div>

        {view === 'month' ? (
          <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => { let m = viewMonth0 - 1, y = viewYear; if (m < 0) { m = 11; y-- } setViewMonth0(m); setViewYear(y) }} style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #d4d4d8', background: '#fff', color: '#18181b', cursor: 'pointer', fontSize: 13 }}>&larr;</button>
                <span style={{ fontSize: '15.5px', fontWeight: 700, letterSpacing: '-0.01em', minWidth: 150, display: 'inline-block' }}>{monthLabel}</span>
                <button onClick={() => { let m = viewMonth0 + 1, y = viewYear; if (m > 11) { m = 0; y++ } setViewMonth0(m); setViewYear(y) }} style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #d4d4d8', background: '#fff', color: '#18181b', cursor: 'pointer', fontSize: 13 }}>&rarr;</button>
              </div>
              <button onClick={() => { setViewYear(now.getFullYear()); setViewMonth0(now.getMonth()) }} style={{ background: '#fff', border: '1px solid #d4d4d8', color: '#18181b', borderRadius: 7, fontSize: '12.5px', fontWeight: 600, padding: '7px 13px', cursor: 'pointer', fontFamily: 'inherit' }}>Today</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: '#e4e4e7', border: '1px solid #e4e4e7', borderRadius: 8, overflow: 'hidden' }}>
              {DOW.map(d => <div key={d} className="pc-dow" style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#a1a1aa', textAlign: 'center' as const, padding: '8px 0', background: '#fff' }}>{d}</div>)}
              {Array.from({ length: firstDayIndex }, (_, i) => <MonthDayCell key={`e${i}`} day={0} monthEvents={[]} isToday={false} isEmpty now={now} onDayClick={() => {}} onEventClick={() => {}} />)}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1
                const dayEvents = filtered.filter(e => sameDay(e.start, viewYear, viewMonth0, day)).sort((a, b) => a.start.getTime() - b.start.getTime())
                const isToday = sameDay(now, viewYear, viewMonth0, day)
                return (
                  <MonthDayCell
                    key={day}
                    day={day}
                    monthEvents={dayEvents}
                    isToday={isToday}
                    isEmpty={false}
                    now={now}
                    onDayClick={() => setDayModal({ y: viewYear, m: viewMonth0, d: day })}
                    onEventClick={openEvent}
                  />
                )
              })}
            </div>
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 12, padding: 16 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center' as const, color: '#71717a', fontSize: 13 }}>No events match that search.</div>
            ) : (
              [...filtered].sort((a, b) => a.start.getTime() - b.start.getTime()).map(e => <AgendaRow key={e.id} e={e} now={now} onClick={() => openEvent(e)} />)
            )}
          </div>
        )}

        <footer style={{ textAlign: 'center' as const, fontSize: 12, color: '#a1a1aa', padding: '28px 20px 50px' }}>
          Canyons School District TV · This calendar is curated by CSDtv from schools across the district.
        </footer>
      </div>

      {dayModal && (
        <div onClick={() => setDayModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(24,24,27,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto' as const, background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 12px 40px rgba(0,0,0,0.18)', border: '1px solid #e4e4e7' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{fmtDateLong(new Date(dayModal.y, dayModal.m, dayModal.d))} — {dayModalEvents.length} event{dayModalEvents.length === 1 ? '' : 's'}</h2>
              <button onClick={() => setDayModal(null)} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>&times;</button>
            </div>
            <div>
              {dayModalEvents.sort((a, b) => a.start.getTime() - b.start.getTime()).map(e => <AgendaRow key={e.id} e={e} now={now} onClick={() => openEvent(e)} />)}
            </div>
          </div>
        </div>
      )}

      {eventModal && (
        <div onClick={closeEventModal} style={{ position: 'fixed', inset: 0, background: 'rgba(24,24,27,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto' as const, background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 12px 40px rgba(0,0,0,0.18)', border: '1px solid #e4e4e7' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.03em', color: '#71717a', marginBottom: 2 }}>{eventModal.schoolName}</div>
                <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}><StreamTag state={eventState} />{eventModal.title}</h2>
              </div>
              <button onClick={closeEventModal} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>&times;</button>
            </div>
            <p style={{ fontSize: 13, color: '#71717a', margin: '0 0 16px' }}>
              {fmtDateLong(eventModal.start)} · {fmtTime(eventModal.start)}{eventModal.location ? ` · ${eventModal.location}` : ''} · {CAT_LABEL[eventModal.category]}
            </p>
            {eventModal.description && <p style={{ fontSize: '13.5px', color: '#18181b', margin: '0 0 16px', lineHeight: 1.6 }}>{eventModal.description}</p>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              {eventState === 'live' && eventModal.streamUrl && (
                <a href={eventModal.streamUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#065687', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, padding: '9px 15px', textDecoration: 'none' }}>▶ Watch live</a>
              )}
              {eventState === 'upcoming' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fafafa', color: '#a1a1aa', border: '1px solid #e4e4e7', borderRadius: 8, fontSize: 13, fontWeight: 600, padding: '9px 15px' }}>Watch link available day-of</span>
              )}
              <button onClick={() => downloadIcs(eventModal)} style={{ background: '#fff', border: '1px solid #d4d4d8', color: '#18181b', borderRadius: 8, fontSize: 13, fontWeight: 600, padding: '9px 15px', cursor: 'pointer', fontFamily: 'inherit' }}>+ Add to my calendar</button>
              <button onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/calendar?event=${eventModal.id}`)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }} style={{ background: '#fff', border: '1px solid #d4d4d8', color: '#18181b', borderRadius: 8, fontSize: 13, fontWeight: 600, padding: '9px 15px', cursor: 'pointer', fontFamily: 'inherit' }}>{copied ? 'Link copied' : 'Copy link'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 700px) {
          .pc-week-grid { display: none !important; }
          .pc-week-daystrip { display: flex !important; }
          .pc-week-single-day { display: block !important; }
          .pc-day-cell-rows { display: none !important; }
          .pc-day-cell-count { display: block !important; }
          .pc-day-cell { height: 46px !important; padding: 4px 2px !important; }
          .pc-dow { font-size: 9px !important; padding: 6px 0 !important; }
        }
      `}</style>
    </div>
  )
}
