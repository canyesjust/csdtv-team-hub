'use client'

import { Suspense, useEffect, useMemo, useState, useCallback, useRef, type ChangeEvent } from 'react'
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
const WEEK_CELL_HEIGHT = 380

type SchoolGroup = { schoolId: string; schoolName: string; schoolColor: string | null; events: CalEvent[] }

/** Groups a day's events by school so one school's games/events read together
 * instead of interleaving with every other school by pure time. Groups are
 * ordered by their earliest event so the day still reads roughly
 * chronologically at a glance. Builds fresh sorted arrays rather than
 * sorting `events` in place -- harmless today since each group's array is
 * newly built by this function, but sorting a copy means that stays true
 * even if a future caller starts passing in an array it reuses elsewhere. */
function groupBySchool(dayEvents: CalEvent[]): SchoolGroup[] {
  const order: string[] = []
  const map = new Map<string, CalEvent[]>()
  for (const e of dayEvents) {
    const existing = map.get(e.schoolId)
    if (existing) {
      existing.push(e)
    } else {
      map.set(e.schoolId, [e])
      order.push(e.schoolId)
    }
  }
  const groups: SchoolGroup[] = order.map(id => {
    const events = [...map.get(id)!].sort((a, b) => a.start.getTime() - b.start.getTime())
    const first = events[0]
    return { schoolId: first.schoolId, schoolName: first.schoolName, schoolColor: first.schoolColor, events }
  })
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

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean
  if (full.length !== 6) return null
  const r = Number.parseInt(full.slice(0, 2), 16) / 255
  const g = Number.parseInt(full.slice(2, 4), 16) / 255
  const b = Number.parseInt(full.slice(4, 6), 16) / 255
  if ([r, g, b].some(Number.isNaN)) return null
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return { h, s, l }
}

function hslToHex(h: number, s: number, l: number): string {
  function hue2rgb(p: number, q: number, t: number): number {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  let r: number, g: number, b: number
  if (s === 0) {
    r = g = b = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** A school's real brand color is sometimes a very dark navy (Corner
 * Canyon's is #001236 -- correct for letterhead, but at the size of a 6px
 * dot or a thin border it just reads as black, not "the school's color").
 * Floors the lightness while keeping the same hue and saturation, so a dark
 * navy still reads as blue at a glance. Only touches colors that are
 * already too dark to read; a school with a bright, legible brand color
 * passes through completely unchanged. This never writes back to the
 * school's actual stored brand color -- it only affects how the color
 * renders on this calendar. */
const MIN_ACCENT_LIGHTNESS = 0.28
function visibleAccentColor(hex: string | null): string {
  if (!hex) return '#a1a1aa'
  const hsl = hexToHsl(hex)
  if (!hsl) return hex
  if (hsl.l >= MIN_ACCENT_LIGHTNESS) return hex
  const s = hsl.s > 0 ? hsl.s : 0.4
  return hslToHex(hsl.h, Math.min(s, 0.85), MIN_ACCENT_LIGHTNESS)
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

// Every "add to calendar" destination (ics download, Google, Outlook) pulls
// from these two builders so the title/description are consistent and none
// of them silently drop the school name or the stream link the way the old
// bare-bones ics export did.
function calendarEventTitle(e: CalEvent): string {
  return `${e.schoolName} — ${e.title}`
}

function calendarEventDescription(e: CalEvent): string {
  const parts: string[] = []
  if (e.description) parts.push(e.description)
  if (e.isStreaming && e.streamUrl) parts.push(`Watch live: ${e.streamUrl}`)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  parts.push(`Added from the Canyons School District events calendar — ${origin}/calendar?event=${e.id}`)
  return parts.join('\n\n')
}

// RFC 5545 TEXT escaping: backslash, semicolon, comma, then newline -> \n.
// Order matters -- backslash must be escaped first or it double-escapes the
// backslashes we just inserted for the other characters.
function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

function downloadIcs(e: CalEvent) {
  const end = e.end || new Date(e.start.getTime() + 2 * 3600 * 1000)
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Canyons School District//Events Calendar//EN', 'BEGIN:VEVENT',
    `UID:${e.id}@csdtv-team-hub`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(e.start)}`, `DTEND:${fmt(end)}`,
    `SUMMARY:${escapeIcsText(calendarEventTitle(e))}`,
    e.location ? `LOCATION:${escapeIcsText(e.location)}` : '',
    `DESCRIPTION:${escapeIcsText(calendarEventDescription(e))}`,
    `CATEGORIES:${escapeIcsText(CAT_LABEL[e.category])}`,
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

function googleCalendarUrl(e: CalEvent): string {
  const end = e.end || new Date(e.start.getTime() + 2 * 3600 * 1000)
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: calendarEventTitle(e),
    dates: `${fmt(e.start)}/${fmt(end)}`,
    details: calendarEventDescription(e),
  })
  if (e.location) params.set('location', e.location)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function outlookCalendarUrl(e: CalEvent): string {
  const end = e.end || new Date(e.start.getTime() + 2 * 3600 * 1000)
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    startdt: e.start.toISOString(),
    enddt: end.toISOString(),
    subject: calendarEventTitle(e),
    body: calendarEventDescription(e),
  })
  if (e.location) params.set('location', e.location)
  return `https://outlook.live.com/calendar/deeplink/compose?${params.toString()}`
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
    <div onClick={onClick} className="pc-agenda-row" style={{ display: 'block', padding: '10px 10px', borderRadius: 8, cursor: 'pointer', borderBottom: '1px solid #e4e4e7' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#18181b' }}>{e.schoolName}</div>
      <div style={{ fontSize: 12.5, color: '#71717a', marginTop: 1 }}><StreamTag state={state} />{e.title}</div>
      <div style={{ fontSize: 11.5, color: '#a1a1aa', marginTop: 1 }}>{fmtDateLong(e.start)} · {fmtTime(e.start)}{e.location ? ` · ${e.location}` : ''}</div>
    </div>
  )
}

type SupabaseClient = ReturnType<typeof createClient>

type RawEventRow = {
  id: string
  school_id: string
  title: string
  start_time: string
  end_time: string | null
  location: string | null
  description: string | null
  category: string | null
  is_streaming: boolean | null
  stream_url: string | null
}

// Supabase caps a single request at 1000 rows by default. The public
// calendar was under that cap when this was written (published events
// numbered in the low thousands total, visible ones fewer still), so a
// plain .select() here happened to return everything -- but that was luck,
// not a guarantee, and the same silent-truncation bug this fixed on the
// staff review/feeds pages was waiting here too as the visible count grew.
// Page through with .range() until a page comes back short, same pattern as
// fetchAllEvents in app/dashboard/calendar/review/page.tsx. id is a stable
// tiebreaker for rows sharing a start_time (a whole sync batch often does).
async function fetchAllVisibleEvents(supabase: SupabaseClient): Promise<RawEventRow[]> {
  const PAGE_SIZE = 1000
  const rows: RawEventRow[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('calendar_school_events')
      .select('id, school_id, title, start_time, end_time, location, description, category, is_streaming, stream_url')
      .eq('status', 'visible')
      .order('start_time', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...((data || []) as RawEventRow[]))
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return rows
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
      className={`pc-day-cell${monthEvents.length > 0 ? ' pc-day-cell-clickable' : ''}`}
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
  const [addCalendarOpen, setAddCalendarOpen] = useState(false)
  const addCalendarRef = useRef<HTMLDivElement>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: schoolRows }, eventRows] = await Promise.all([
        supabase.from('schools')
          .select('id, name, primary_color')
          .eq('active', true)
          .or('type.eq.school,name.eq.Board of Education,name.eq.Canyons School District')
          .order('name'),
        fetchAllVisibleEvents(supabase),
      ])

      const schoolList: SchoolOption[] = schoolRows || []
      setSchools(schoolList)
      const schoolMap = new Map(schoolList.map(s => [s.id, s]))

      const mapped: CalEvent[] = eventRows.map(e => ({
        id: e.id,
        schoolId: e.school_id,
        schoolName: schoolMap.get(e.school_id)?.name || 'Canyons School District',
        schoolColor: visibleAccentColor(schoolMap.get(e.school_id)?.primary_color || null),
        title: e.title,
        start: new Date(e.start_time),
        end: e.end_time ? new Date(e.end_time) : null,
        location: e.location || null,
        description: e.description || null,
        category: (e.category as CalCategory) || 'academics',
        isStreaming: !!e.is_streaming,
        streamUrl: e.stream_url || null,
      }))
      setEvents(mapped)
    } catch (err) {
      // A page failing partway through (network hiccup, a transient 500)
      // shouldn't leave the page stuck on "Loading..." forever with no
      // explanation -- fall back to whatever's already in state (empty on
      // first load) and let the page render normally.
      console.error('Failed to load calendar data', err)
    } finally {
      setLoading(false)
    }
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
    setAddCalendarOpen(false)
    router.replace(`/calendar?event=${e.id}`, { scroll: false })
  }
  function closeEventModal() {
    setEventModalId(null)
    setCopied(false)
    setAddCalendarOpen(false)
    router.replace('/calendar', { scroll: false })
  }

  // Close the "add to calendar" menu on outside click.
  useEffect(() => {
    if (!addCalendarOpen) return
    function onDocClick(ev: MouseEvent) {
      if (addCalendarRef.current && !addCalendarRef.current.contains(ev.target as Node)) {
        setAddCalendarOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [addCalendarOpen])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return events.filter(e =>
      (!schoolFilter || e.schoolId === schoolFilter)
      && (!categoryFilter || e.category === categoryFilter)
      && (!q || e.title.toLowerCase().includes(q) || e.schoolName.toLowerCase().includes(q))
    )
  }, [events, search, schoolFilter, categoryFilter])

  // Every "which events land on this specific day" lookup (week columns,
  // every month cell, the day modal) used to re-filter the *entire* filtered
  // list from scratch -- fine at today's few-hundred-events scale, but
  // O(days x events) and only getting worse as more schools' feeds get
  // synced. One grouping pass here, memoized on `filtered`, turns every one
  // of those into an O(1) map lookup instead. Each day's array is
  // pre-sorted by start time so callers don't need to sort again.
  const eventsByDayKey = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    for (const e of filtered) {
      const key = `${e.start.getFullYear()}-${e.start.getMonth()}-${e.start.getDate()}`
      const existing = map.get(key)
      if (existing) existing.push(e)
      else map.set(key, [e])
    }
    for (const dayEvents of map.values()) dayEvents.sort((a, b) => a.start.getTime() - b.start.getTime())
    return map
  }, [filtered])
  const dayKey = (y: number, m: number, d: number) => `${y}-${m}-${d}`

  const eventModal = eventModalId ? events.find(e => e.id === eventModalId) || null : null

  const [weekStart, setWeekStart] = useState(() => startOfWeek(now))
  const thisWeekStart = useMemo(() => startOfWeek(now), [now])
  const isCurrentWeek = weekStart.getTime() === thisWeekStart.getTime()
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)
      const dayEvents = eventsByDayKey.get(dayKey(d.getFullYear(), d.getMonth(), d.getDate())) || []
      return { d, dayEvents }
    })
  }, [weekStart, eventsByDayKey])

  const monthLabel = `${MONTH_NAMES[viewMonth0]} ${viewYear}`
  const daysInMonth = new Date(viewYear, viewMonth0 + 1, 0).getDate()
  const firstDayIndex = new Date(viewYear, viewMonth0, 1).getDay()
  const monthEventsThisMonth = useMemo(
    () => filtered.filter(e => e.start.getFullYear() === viewYear && e.start.getMonth() === viewMonth0),
    [filtered, viewYear, viewMonth0]
  )
  const distinctSchoolsThisMonth = useMemo(
    () => new Set(monthEventsThisMonth.map(e => e.schoolId)).size,
    [monthEventsThisMonth]
  )

  const dayModalEvents = dayModal
    ? eventsByDayKey.get(dayKey(dayModal.y, dayModal.m, dayModal.d)) || []
    : []

  const eventState = eventModal ? streamState(eventModal, now) : null

  return (
    <div className="pc-page" style={{ margin: 0, background: '#fafafa', color: '#18181b', fontFamily: '-apple-system, BlinkMacSystemFont, Inter, "Segoe UI", Helvetica, Arial, sans-serif', fontSize: '14.5px', lineHeight: 1.5, minHeight: '100vh' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #e4e4e7', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(24,24,27,0.03)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 700, fontSize: '14.5px', letterSpacing: '-0.01em' }}>
          <span style={{ width: 26, height: 26, borderRadius: 7, background: '#065687', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>C</span>
          CSDtv <span style={{ color: '#71717a', fontWeight: 500 }}>&nbsp;/ District Calendar</span>
        </div>
        <Link href="/calendar/submit" className="pc-btn-primary" style={{ background: '#065687', color: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
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
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-start', maxWidth: 700, margin: '14px 0 4px',
          background: '#f0f6fa', border: '1px solid #cfe3ee', borderRadius: 10, padding: '11px 14px',
        }}>
          <span style={{ fontSize: 14, lineHeight: 1, marginTop: 1 }}>ℹ️</span>
          <p style={{ fontSize: 12.5, color: '#2c4a5c', margin: 0, lineHeight: 1.55 }}>
            <strong>This is an aggregated listing, not an exhaustive one.</strong> It&apos;s gathered from event feeds published by schools across the district, so a school&apos;s full schedule may include items that aren&apos;t captured here. It&apos;s intended to help board members and district leadership see what&apos;s happening and choose what to attend.
          </p>
        </div>
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
            className="pc-field"
            style={{ background: '#fff', border: '1px solid #d4d4d8', color: '#18181b', borderRadius: 8, padding: '0 12px', height: 36, fontSize: '13.5px', fontFamily: 'inherit', flex: 1, minWidth: 190, boxShadow: '0 1px 2px rgba(24,24,27,0.03)' }}
          />
          <select
            value={schoolFilter}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setSchoolFilter(e.target.value)}
            className="pc-field"
            style={{ background: '#fff', border: '1px solid #d4d4d8', color: '#18181b', borderRadius: 8, padding: '0 12px', height: 36, fontSize: '13.5px', fontFamily: 'inherit', minWidth: 170, boxShadow: '0 1px 2px rgba(24,24,27,0.03)' }}
          >
            <option value="">All {schools.length} schools</option>
            {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select
            value={categoryFilter}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setCategoryFilter(e.target.value)}
            className="pc-field"
            style={{ background: '#fff', border: '1px solid #d4d4d8', color: '#18181b', borderRadius: 8, padding: '0 12px', height: 36, fontSize: '13.5px', fontFamily: 'inherit', minWidth: 170, boxShadow: '0 1px 2px rgba(24,24,27,0.03)' }}
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
              <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="pc-navbtn" style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #d4d4d8', background: '#fff', color: '#18181b', cursor: 'pointer', fontSize: 13 }}>&larr;</button>
              <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="pc-navbtn" style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #d4d4d8', background: '#fff', color: '#18181b', cursor: 'pointer', fontSize: 13 }}>&rarr;</button>
              {!isCurrentWeek && (
                <button onClick={() => setWeekStart(thisWeekStart)} className="pc-navbtn" style={{ background: '#fff', border: '1px solid #d4d4d8', color: '#18181b', borderRadius: 7, fontSize: '12.5px', fontWeight: 600, padding: '7px 13px', cursor: 'pointer', fontFamily: 'inherit' }}>This week</button>
              )}
            </div>
          </div>

          <div className="pc-week-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 1, background: '#e4e4e7', border: '1px solid #e4e4e7', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 2px rgba(24,24,27,0.04), 0 6px 20px rgba(24,24,27,0.035)' }}>
            {weekDays.map(({ d, dayEvents }, i) => {
              const isToday = sameDay(now, d.getFullYear(), d.getMonth(), d.getDate())
              const groups = groupBySchool(dayEvents)
              return (
                <div key={i} style={{ background: isToday ? '#eff6ff' : '#fff', height: WEEK_CELL_HEIGHT, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '14px 12px 8px', flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: '#a1a1aa' }}>{DOW[i]}</span>
                    <span style={isToday
                      ? { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: '#2791D0', color: '#fff', fontSize: 14, fontWeight: 700 }
                      : { fontSize: 14, fontWeight: 700, color: '#18181b' }
                    }>{d.getDate()}</span>
                  </div>
                  {/* Every event for the day renders here -- no cap, no "+N more."
                      A packed day scrolls within its own column instead of either
                      truncating text or stretching the whole week's row to match
                      the busiest day. */}
                  <div className="pc-week-day-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto' as const, padding: '0 12px 12px' }}>
                    {groups.map((g, gi) => (
                      <div key={g.schoolId} style={{
                        minWidth: 0, background: hexToRgba(g.schoolColor, 0.16), borderLeft: `3px solid ${g.schoolColor || '#a1a1aa'}`,
                        borderRadius: '0 7px 7px 0', padding: '4px 5px 4px 6px', marginBottom: 4,
                      }}>
                        <SchoolGroupHeader group={g} first={gi === 0} />
                        {g.events.map(e => <EventRow key={e.id} e={e} now={now} hideSchool onClick={() => openEvent(e)} />)}
                      </div>
                    ))}
                    {dayEvents.length === 0 && <div style={{ fontSize: 11, color: '#a1a1aa', padding: '4px 3px' }}>No events</div>}
                  </div>
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
          <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 12, padding: 16, boxShadow: '0 1px 2px rgba(24,24,27,0.04), 0 6px 20px rgba(24,24,27,0.035)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => { let m = viewMonth0 - 1, y = viewYear; if (m < 0) { m = 11; y-- } setViewMonth0(m); setViewYear(y) }} className="pc-navbtn" style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #d4d4d8', background: '#fff', color: '#18181b', cursor: 'pointer', fontSize: 13 }}>&larr;</button>
                <span style={{ fontSize: '15.5px', fontWeight: 700, letterSpacing: '-0.01em', minWidth: 150, display: 'inline-block' }}>{monthLabel}</span>
                <button onClick={() => { let m = viewMonth0 + 1, y = viewYear; if (m > 11) { m = 0; y++ } setViewMonth0(m); setViewYear(y) }} className="pc-navbtn" style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #d4d4d8', background: '#fff', color: '#18181b', cursor: 'pointer', fontSize: 13 }}>&rarr;</button>
              </div>
              <button onClick={() => { setViewYear(now.getFullYear()); setViewMonth0(now.getMonth()) }} className="pc-navbtn" style={{ background: '#fff', border: '1px solid #d4d4d8', color: '#18181b', borderRadius: 7, fontSize: '12.5px', fontWeight: 600, padding: '7px 13px', cursor: 'pointer', fontFamily: 'inherit' }}>Today</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 1, background: '#e4e4e7', border: '1px solid #e4e4e7', borderRadius: 8, overflow: 'hidden' }}>
              {DOW.map(d => <div key={d} className="pc-dow" style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#a1a1aa', textAlign: 'center' as const, padding: '8px 0', background: '#fff' }}>{d}</div>)}
              {Array.from({ length: firstDayIndex }, (_, i) => <MonthDayCell key={`e${i}`} day={0} monthEvents={[]} isToday={false} isEmpty onDayClick={() => {}} />)}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1
                const dayEvents = eventsByDayKey.get(dayKey(viewYear, viewMonth0, day)) || []
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
          <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 12, padding: 16, boxShadow: '0 1px 2px rgba(24,24,27,0.04), 0 6px 20px rgba(24,24,27,0.035)' }}>
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
                <a href={eventModal.streamUrl} target="_blank" rel="noreferrer" className="pc-btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#065687', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, padding: '9px 15px', textDecoration: 'none' }}>▶ Watch live</a>
              )}
              {eventState === 'upcoming' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fafafa', color: '#a1a1aa', border: '1px solid #e4e4e7', borderRadius: 8, fontSize: 13, fontWeight: 600, padding: '9px 15px' }}>Watch link available day-of</span>
              )}
              <div ref={addCalendarRef} style={{ position: 'relative' as const }}>
                <button onClick={() => setAddCalendarOpen(o => !o)} className="pc-navbtn" style={{ background: '#fff', border: '1px solid #d4d4d8', color: '#18181b', borderRadius: 8, fontSize: 13, fontWeight: 600, padding: '9px 15px', cursor: 'pointer', fontFamily: 'inherit' }}>+ Add to my calendar</button>
                {addCalendarOpen && (
                  <div style={{ position: 'absolute' as const, top: '100%', left: 0, marginTop: 4, background: '#fff', border: '1px solid #e4e4e7', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', zIndex: 70, minWidth: 200, overflow: 'hidden' }}>
                    <a href={googleCalendarUrl(eventModal)} target="_blank" rel="noreferrer" onClick={() => setAddCalendarOpen(false)} className="pc-menu-item" style={{ display: 'block', padding: '9px 14px', fontSize: 13, color: '#18181b', textDecoration: 'none' }}>Google Calendar</a>
                    <a href={outlookCalendarUrl(eventModal)} target="_blank" rel="noreferrer" onClick={() => setAddCalendarOpen(false)} className="pc-menu-item" style={{ display: 'block', padding: '9px 14px', fontSize: 13, color: '#18181b', textDecoration: 'none', borderTop: '1px solid #f4f4f5' }}>Outlook.com</a>
                    <button onClick={() => { downloadIcs(eventModal); setAddCalendarOpen(false) }} className="pc-menu-item" style={{ display: 'block', width: '100%', textAlign: 'left' as const, padding: '9px 14px', fontSize: 13, color: '#18181b', background: 'none', border: 'none', borderTop: '1px solid #f4f4f5', cursor: 'pointer', fontFamily: 'inherit' }}>Apple Calendar / other (.ics)</button>
                  </div>
                )}
              </div>
              <button onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/calendar?event=${eventModal.id}`)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }} className="pc-navbtn" style={{ background: '#fff', border: '1px solid #d4d4d8', color: '#18181b', borderRadius: 8, fontSize: 13, fontWeight: 600, padding: '9px 15px', cursor: 'pointer', fontFamily: 'inherit' }}>{copied ? 'Link copied' : 'Copy link'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .pc-week-day-scroll { scrollbar-width: thin; }
        .pc-week-day-scroll::-webkit-scrollbar { width: 5px; }
        .pc-week-day-scroll::-webkit-scrollbar-thumb { background: #d4d4d8; border-radius: 3px; }

        /* Smooths every color/shadow change on interactive elements (active
           view-toggle state, "today" pill, etc.) even where we don't add a
           dedicated hover rule below. */
        .pc-page button, .pc-page a, .pc-page input, .pc-page select {
          transition: background-color .15s ease, border-color .15s ease, box-shadow .15s ease, color .15s ease;
        }

        /* These use !important because the buttons set their own background
           inline (it can depend on component state, e.g. the active view
           toggle) -- a plain :hover rule in this stylesheet would lose to
           that inline style every time. */
        .pc-navbtn:hover { background: #f4f4f5 !important; border-color: #c4c4c8 !important; }
        .pc-btn-primary:hover { background: #054e73 !important; }
        .pc-menu-item:hover { background: #f4f4f5 !important; }
        .pc-agenda-row:hover { background: #fafafa !important; }
        .pc-day-cell-clickable:hover { background: #f7fafc !important; }
        .pc-field:focus { outline: none; border-color: #065687 !important; box-shadow: 0 0 0 3px rgba(6,86,135,0.12) !important; }

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
