'use client'

import { Suspense, useEffect, useMemo, useState, useCallback, type ChangeEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
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
  schoolColor: string | null
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
const WEEK_MAX_VISIBLE = 10

type SchoolGroup = { schoolId: string; schoolName: string; schoolColor: string | null; events: CalEvent[] }

/** Groups a day's events by school so one school's games/events read together
 * instead of interleaving with every other school by pure time. Groups are
 * ordered by their earliest event so the day still reads roughly
 * chronologically at a glance. */
function groupBySchool(dayEvents: CalEvent[]): SchoolGroup[] {
  const order: string[] = []
  const map = new Map<string, SchoolGroup>()
  for (const e of dayEvents) {
    if (!map.has(e.schoolId)) {
      map.set(e.schoolId, { schoolId: e.schoolId, schoolName: e.schoolName, schoolColor: e.schoolColor, events: [] })
      order.push(e.schoolId)
    }
    map.get(e.schoolId)!.events.push(e)
  }
  const groups = order.map(id => map.get(id)!)
  for (const g of groups) g.events.sort((a, b) => a.start.getTime() - b.start.getTime())
  groups.sort((a, b) => a.events[0].start.getTime() - b.events[0].start.getTime())
  return groups
}

function sameDay(a: Date, y: number, m: number, d: number): boolean {
  return a.getFullYear() === y && a.getMonth() === m && a.getDate() === d
}

function startOfWeek(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  c.setDate(c.getDate() - c.getDay())
  return c
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  c.setDate(c.getDate() + n)
  return c
}

function fmtTime(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d)
}

function fmtDateLong(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)
}

function fmtDateShort(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d)
}

/** A faded tint of a school's brand color for backgrounds -- readable against
 * dark text at low opacity, and falls back to a neutral gray for schools
 * that don't have a color set rather than tinting nothing at all. */
function hexToRgba(hex: string | null, alpha: number): string {
  const fallback = `rgba(161,161,170,${alpha})`
  if (!hex) return fallback
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean
  if (full.length !== 6) return fallback
  const r = Number.parseInt(full.slice(0, 2), 16)
  const g = Number.parseInt(full.slice(2, 4), 16)
  const b = Number.parseInt(full.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return fallback
  return `rgba(${r},${g},${b},${alpha})`
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

function EventRow({ e, now, dense, hideSchool, onClick }: { e: CalEvent; now: Date; dense?: boolean; hideSchool?: boolean; onClick: () => void }) {
  const state = streamState(e, now)
  return (
    <div onClick={onClick} style={{ padding: dense ? '1.5px 3px' : '5px 4px', borderRadius: dense ? 4 : 6, cursor: 'pointer', minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: dense ? '10.5px' : '12.5px', fontWeight: dense ? 400 : 700, color: '#18181b', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
        {!dense && !hideSchool && <span style={{ display: 'block' }}>{e.schoolName}</span>}
        <StreamTag state={state} />{e.title}
      </span>
      {!dense && (
        <span style={{ display: 'block', fontSize: 10.5, color: '#a1a1aa', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
          {fmtTime(e.start)}{e.location ? ` · ${e.location}` : ''}
        </span>
      )}
    </div>
  )
}

function SchoolGroupHeader({ group, first }: { group: SchoolGroup; first: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, margin: first ? '0 0 2px' : '10px 0 2px', minWidth: 0 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: group.schoolColor || '#a1a1aa', flexShrink: 0 }} />
      <span style={{ fontSize: 10.5, fontWeight: 800, color: '#3f3f46', textTransform: 'uppercase' as const, letterSpacing: '0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
        {group.schoolName}
      </span>
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

const MONTH_CELL_HEIGHT = 138
const MAX_SCHOOL_GROUPS_PER_CELL = 5

function MonthDayCell({
  day, monthEvents, isToday, isEmpty, onDayClick,
}: {
  day: number
  monthEvents: CalEvent[]
  isToday: boolean
  isEmpty: boolean
  onDayClick: () => void
}) {
  if (isEmpty) return <div className="pc-day-cell" style={{ height: MONTH_CELL_HEIGHT, background: '#fafafa' }} />
  // A busy day can have 20+ events across half a dozen schools -- listing
  // every title never fit in a month cell and just cut off mid-word. Group
  // by school instead so the cell answers "which schools, how much" at a
  // glance; the day modal (opened by clicking the cell) still has every
  // single event, grouped and in full.
  const groups = groupBySchool(monthEvents)
  const visibleGroups = groups.slice(0, MAX_SCHOOL_GROUPS_PER_CELL)
  const extraGroups = groups.length - visibleGroups.length
  return (
    <div
      onClick={monthEvents.length > 0 ? onDayClick : undefined}
      className="pc-day-cell"
      style={{
        height: MONTH_CELL_HEIGHT, background: '#fff', padding: '6px 6px', display: 'flex', flexDirection: 'column', gap: 2,
        overflow: 'hidden', position: 'relative', cursor: monthEvents.length > 0 ? 'pointer' : 'default',
      }}
    >
      <div style={isToday
        ? { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 19, height: 19, borderRadius: '50%', background: '#2791D0', color: '#fff', fontWeight: 700, fontSize: 11, marginBottom: 2 }
        : { fontSize: 11, color: '#71717a', fontWeight: 600, marginBottom: 2 }
      }>{day}</div>
      <div className="pc-day-cell-rows" style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden', minHeight: 0 }}>
        {visibleGroups.map(g => (
          <div key={g.schoolId} style={{
            display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, background: hexToRgba(g.schoolColor, 0.14),
            borderRadius: 4, padding: '2px 5px',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: g.schoolColor || '#a1a1aa', flexShrink: 0 }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: '#18181b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1, minWidth: 0 }}>
              {g.schoolName}
            </span>
            {g.events.length > 1 && <span style={{ fontSize: 9.5, fontWeight: 700, color: '#71717a', flexShrink: 0 }}>{g.events.length}</span>}
          </div>
        ))}
        {extraGroups > 0 && (
          <div style={{ fontSize: 10, fontWeight: 700, color: '#065687', padding: '1px 5px' }}>+{extraGroups} more school{extraGroups === 1 ? '' : 's'}</div>
        )}
      </div>
      {monthEvents.length > 0 && (
        <>
          <div style={{ fontSize: 9.5, color: '#a1a1aa', marginTop: 'auto', paddingTop: 2 }}>
            {monthEvents.length} event{monthEvents.length === 1 ? '' : 's'}
          </div>
          <div className="pc-day-cell-count" style={{ display: 'none', fontSize: 9, fontWeight: 700, color: '#065687', marginTop: 'auto' }}>{monthEvents.length}</div>
        </>
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
      schoolColor: schoolMap.get(e.school_id as string)?.primary_color || null,
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
    async function run() {
      await loadData()
    }
    run()
  }, [loadData])

  // Deep link: ?event=<id> opens that event's modal once data has loaded.
  useEffect(() => {
    function run() {
      const id = searchParams.get('event')
      if (id && events.some(e => e.id === id)) setEventModalId(id)
    }
    run()
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

  const [weekStart, setWeekStart] = useState(() => startOfWeek(now))
  const thisWeekStart = useMemo(() => startOfWeek(now), [now])
  const isCurrentWeek = weekStart.getTime() === thisWeekStart.getTime()
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])
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
        <Link href="/calendar/submit" style={{ background: '#065687', color: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
          + Submit an event
        </Link>
      </div>

      <div style={{ maxWidth: 1680, margin: '0 auto', padding: '30px 40px 8px' }}>
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

      <div style={{ maxWidth: 1680, margin: '0 auto', padding: '20px 40px 90px' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 8, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#71717a', margin: 0 }}>
                {isCurrentWeek ? 'This week' : 'Week of'}
              </h2>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#18181b' }}>{fmtDateShort(weekStart)} – {fmtDateShort(weekEnd)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setWeekStart(addDays(weekStart, -7))} style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #d4d4d8', background: '#fff', color: '#18181b', cursor: 'pointer', fontSize: 13 }}>&larr;</button>
              <button onClick={() => setWeekStart(addDays(weekStart, 7))} style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #d4d4d8', background: '#fff', color: '#18181b', cursor: 'pointer', fontSize: 13 }}>&rarr;</button>
              {!isCurrentWeek && (
                <button onClick={() => setWeekStart(thisWeekStart)} style={{ background: '#fff', border: '1px solid #d4d4d8', color: '#18181b', borderRadius: 7, fontSize: '12.5px', fontWeight: 600, padding: '7px 13px', cursor: 'pointer', fontFamily: 'inherit' }}>This week</button>
              )}
            </div>
          </div>

          <div className="pc-week-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 1, background: '#e4e4e7', border: '1px solid #e4e4e7', borderRadius: 10, overflow: 'hidden' }}>
            {weekDays.map(({ d, dayEvents }, i) => {
              const isToday = sameDay(now, d.getFullYear(), d.getMonth(), d.getDate())
              const groups = groupBySchool(dayEvents)
              let shown = 0
              return (
                <div key={i} style={{ background: isToday ? '#eff6ff' : '#fff', minHeight: 340, minWidth: 0, padding: '14px 12px', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: '#a1a1aa' }}>{DOW[i]}</span>
                    <span style={isToday
                      ? { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: '#2791D0', color: '#fff', fontSize: 14, fontWeight: 700 }
                      : { fontSize: 14, fontWeight: 700, color: '#18181b' }
                    }>{d.getDate()}</span>
                  </div>
                  {groups.map(g => {
                    const remaining = WEEK_MAX_VISIBLE - shown
                    if (remaining <= 0) return null
                    const eventsToShow = g.events.slice(0, remaining)
                    shown += eventsToShow.length
                    return (
                      <div key={g.schoolId} style={{ minWidth: 0, background: hexToRgba(g.schoolColor, 0.08), borderRadius: 7, padding: '4px 5px', marginBottom: 4 }}>
                        <SchoolGroupHeader group={g} first={shown === eventsToShow.length} />
                        {eventsToShow.map(e => <EventRow key={e.id} e={e} now={now} hideSchool onClick={() => openEvent(e)} />)}
                      </div>
                    )
                  })}
                  {dayEvents.length - shown > 0 && (
                    <div onClick={() => setDayModal({ y: d.getFullYear(), m: d.getMonth(), d: d.getDate() })} style={{ fontSize: 11, fontWeight: 700, color: '#065687', padding: '6px 3px 2px', cursor: 'pointer' }}>+{dayEvents.length - shown} more</div>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 1, background: '#e4e4e7', border: '1px solid #e4e4e7', borderRadius: 8, overflow: 'hidden' }}>
              {DOW.map(d => <div key={d} className="pc-dow" style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#a1a1aa', textAlign: 'center' as const, padding: '8px 0', background: '#fff' }}>{d}</div>)}
              {Array.from({ length: firstDayIndex }, (_, i) => <MonthDayCell key={`e${i}`} day={0} monthEvents={[]} isToday={false} isEmpty onDayClick={() => {}} />)}
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
                    onDayClick={() => setDayModal({ y: viewYear, m: viewMonth0, d: day })}
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
          {' '}Don&apos;t see your event? <Link href="/calendar/submit" style={{ color: '#065687', fontWeight: 600 }}>Submit it here</Link>.
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
              {groupBySchool(dayModalEvents).map(g => (
                <div key={g.schoolId} style={{ marginBottom: 10, background: hexToRgba(g.schoolColor, 0.06), borderRadius: 8, padding: '6px 8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 4px' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: g.schoolColor || '#a1a1aa', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#3f3f46', textTransform: 'uppercase' as const, letterSpacing: '0.02em' }}>{g.schoolName}</span>
                  </div>
                  {g.events.map(e => <AgendaRow key={e.id} e={e} now={now} onClick={() => openEvent(e)} />)}
                </div>
              ))}
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
