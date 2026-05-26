'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import Link from 'next/link'
import Loader from '../components/Loader'
import { toast } from '@/lib/toast'
import { sanitizeEmailSubject } from '@/lib/escape-html'
import { useOutlookEvents } from './use-outlook-events'
import { resolveEffectiveTeamRow } from '@/lib/effective-team-client'
import { getMondayStr, resolveDayHours, toLocalDateStr, WEEKDAY_KEYS } from '@/lib/team-schedule'

// ─── Pay periods: authoritative rows from district PDF + synthetic extension ──
type PayPeriodRow = { num: number; start: string; end: string; cutoff: string; payday: string }

const PAY_PERIODS_CORE: PayPeriodRow[] = [
  { num: 1,  start: '2025-06-16', end: '2025-06-29', cutoff: '2025-07-07',  payday: '2025-07-15' },
  { num: 2,  start: '2025-06-30', end: '2025-07-13', cutoff: '2025-07-23',  payday: '2025-07-31' },
  { num: 3,  start: '2025-07-14', end: '2025-07-27', cutoff: '2025-08-08',  payday: '2025-08-15' },
  { num: 4,  start: '2025-07-28', end: '2025-08-10', cutoff: '2025-08-22',  payday: '2025-08-29' },
  { num: 5,  start: '2025-08-11', end: '2025-08-31', cutoff: '2025-09-08',  payday: '2025-09-15' },
  { num: 6,  start: '2025-09-01', end: '2025-09-14', cutoff: '2025-09-23',  payday: '2025-09-30' },
  { num: 7,  start: '2025-09-15', end: '2025-09-28', cutoff: '2025-10-02',  payday: '2025-10-15' },
  { num: 8,  start: '2025-09-29', end: '2025-10-12', cutoff: '2025-10-29',  payday: '2025-10-31' },
  { num: 9,  start: '2025-10-13', end: '2025-10-26', cutoff: '2025-11-07',  payday: '2025-11-14' },
  { num: 10, start: '2025-10-27', end: '2025-11-09', cutoff: '2025-11-21',  payday: '2025-11-28' },
  { num: 11, start: '2025-11-10', end: '2025-11-23', cutoff: '2025-12-08',  payday: '2025-12-15' },
  { num: 12, start: '2025-11-24', end: '2025-12-14', cutoff: '2025-12-19',  payday: '2025-12-31' },
  { num: 13, start: '2025-12-15', end: '2026-01-04', cutoff: '2026-01-08',  payday: '2026-01-15' },
  { num: 14, start: '2026-01-05', end: '2026-01-18', cutoff: '2026-01-23',  payday: '2026-01-30' },
  { num: 15, start: '2026-01-19', end: '2026-02-01', cutoff: '2026-02-06',  payday: '2026-02-13' },
  { num: 16, start: '2026-02-02', end: '2026-02-15', cutoff: '2026-02-20',  payday: '2026-02-27' },
  { num: 17, start: '2026-02-16', end: '2026-03-01', cutoff: '2026-03-06',  payday: '2026-03-13' },
  { num: 18, start: '2026-03-02', end: '2026-03-15', cutoff: '2026-03-24',  payday: '2026-03-31' },
  { num: 19, start: '2026-03-16', end: '2026-03-29', cutoff: '2026-04-03',  payday: '2026-04-15' },
  { num: 20, start: '2026-03-30', end: '2026-04-19', cutoff: '2026-04-23',  payday: '2026-04-30' },
  { num: 21, start: '2026-04-20', end: '2026-05-03', cutoff: '2026-05-08',  payday: '2026-05-15' },
  { num: 22, start: '2026-05-04', end: '2026-05-17', cutoff: '2026-05-21',  payday: '2026-05-29' },
  { num: 23, start: '2026-05-18', end: '2026-05-31', cutoff: '2026-06-05',  payday: '2026-06-12' },
  { num: 24, start: '2026-06-01', end: '2026-06-14', cutoff: '2026-06-23',  payday: '2026-06-30' },
  { num: 1,  start: '2026-06-15', end: '2026-06-28', cutoff: '2026-07-08',  payday: '2026-07-15' },
  { num: 2,  start: '2026-06-29', end: '2026-07-12', cutoff: '2026-07-23',  payday: '2026-07-31' },
  { num: 3,  start: '2026-07-13', end: '2026-07-26', cutoff: '2026-08-07',  payday: '2026-08-14' },
  { num: 4,  start: '2026-07-27', end: '2026-08-09', cutoff: '2026-08-24',  payday: '2026-08-31' },
]

/** Approximate future periods (biweekly + simple cutoff/payday offsets). Replace with PDF values when published. */
function extendPayPeriodsFromLast(last: PayPeriodRow, count: number, startNum: number): PayPeriodRow[] {
  const out: PayPeriodRow[] = []
  let num = startNum
  const start = new Date(last.end + 'T12:00:00')
  start.setDate(start.getDate() + 1)
  let curStart = start
  for (let i = 0; i < count; i++) {
    const end = new Date(curStart)
    end.setDate(end.getDate() + 13)
    const cutoff = new Date(end)
    cutoff.setDate(cutoff.getDate() + 5)
    const payday = new Date(cutoff)
    payday.setDate(payday.getDate() + 7)
    out.push({
      num,
      start: toLocalDateStr(curStart),
      end: toLocalDateStr(end),
      cutoff: toLocalDateStr(cutoff),
      payday: toLocalDateStr(payday),
    })
    num = num >= 24 ? 1 : num + 1
    curStart = new Date(end)
    curStart.setDate(curStart.getDate() + 1)
  }
  return out
}

const PAY_PERIODS: PayPeriodRow[] = [
  ...PAY_PERIODS_CORE,
  ...extendPayPeriodsFromLast(PAY_PERIODS_CORE[PAY_PERIODS_CORE.length - 1], 52, 5),
]

// ─── Production type colors ───────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  'Photo Headshots':                          '#e8a020',
  'Create a Video(Film, Edit, Publish)':      '#5ba3e0',
  'LiveStream Meeting':                       '#22c55e',
  'Record Meeting':                           '#9b85e0',
  'Podcast':                                  '#f97316',
  'Board Meeting':                            '#ef4444',
}
const typeColor = (label: string | null) => TYPE_COLORS[label || ''] || '#64748b'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const parseHours = (s: string | null | undefined): number => {
  if (!s || s.toLowerCase() === 'off') return 0
  const clean = s.toLowerCase().replace(/\s/g, '')
  const to24 = (t: string): number => {
    const pm = t.includes('pm')
    const am = t.includes('am')
    const num = parseFloat(t.replace(/[apm]/g, ''))
    const h = Math.floor(num)
    const m = Math.round((num - h) * 100) / 100
    if (pm && h !== 12) return h + 12 + m
    if (am && h === 12) return 0 + m
    return h + m
  }
  const parts = clean.split('-')
  if (parts.length !== 2) return 8
  return Math.max(0, to24(parts[1]) - to24(parts[0]))
}

const countWeekdays = (start: Date, end: Date): number => {
  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

const getPayPeriodsForMonth = (year: number, month: number) => {
  const monthStart = new Date(year, month, 1, 12, 0, 0, 0)
  const monthEnd = new Date(year, month + 1, 0, 12, 0, 0, 0)
  return PAY_PERIODS.filter(pp => {
    const s = new Date(pp.start + 'T12:00:00')
    const e = new Date(pp.end + 'T12:00:00')
    return s <= monthEnd && e >= monthStart
  })
}

const fmt = (dateStr: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', opts)

const getDayOfWeekKey = (dow: number): keyof DaySchedule => {
  return (['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const)[dow] as keyof DaySchedule
}

// ─── Types ────────────────────────────────────────────────────────────────────
type DaySchedule = {
  monday: string; tuesday: string; wednesday: string; thursday: string; friday: string
}

interface ScheduleDefault extends DaySchedule {
  id: string; user_id: string
}

interface ScheduleOverride extends DaySchedule {
  id: string; user_id: string; week_start: string; notes: string | null
}

interface TeamMember {
  id: string; name: string; avatar_color: string; role: string; email?: string
}

interface CurrentUser extends TeamMember { }

interface Production {
  id: string; title: string; production_number: number
  request_type_label: string | null; start_datetime: string | null
}

const DAYS: (keyof DaySchedule)[] = [...WEEKDAY_KEYS]
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri']

const EMPTY_DEFAULT: DaySchedule = { monday:'', tuesday:'', wednesday:'', thursday:'', friday:'' }

interface CalendarEvent { id: string; title: string; date: string; start_time: string | null; end_time: string | null; all_day: boolean; color: string; created_by: string | null }

// ─── Component ────────────────────────────────────────────────────────────────
export default function SchedulePage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const supabase = createClient()

  const [monthOffset, setMonthOffset] = useState(0)
  const [currentUser, setCurrentUser]   = useState<CurrentUser | null>(null)
  const [team, setTeam]                 = useState<TeamMember[]>([])
  const [viewingId, setViewingId]       = useState<string | null>(null) // whose schedule to show
  const [defaults, setDefaults]         = useState<ScheduleDefault[]>([])
  const [overrides, setOverrides]       = useState<ScheduleOverride[]>([])
  const [allTeamDefaults, setAllTeamDefaults] = useState<ScheduleDefault[]>([])
  const [allTeamOverrides, setAllTeamOverrides] = useState<ScheduleOverride[]>([])
  const [productions, setProductions]   = useState<Production[]>([])
  const [calEvents, setCalEvents]       = useState<CalendarEvent[]>([])
  const [loading, setLoading]           = useState(true)
  const [editingDefault, setEditingDefault] = useState(false)
  const [editingOverride, setEditingOverride] = useState(false)
  const [myDefault, setMyDefault]       = useState<DaySchedule>({ ...EMPTY_DEFAULT })
  const [myOverride, setMyOverride]     = useState<DaySchedule & { notes: string }>({ ...EMPTY_DEFAULT, notes: '' })
  const [overrideWeek, setOverrideWeek] = useState('') // which week_start to edit
  const [hoveredProd, setHoveredProd]   = useState<string | null>(null)
  const [editingCell, setEditingCell]   = useState<{ dateStr: string; value: string } | null>(null)
  const [showMassFill, setShowMassFill] = useState(false)
  const [massFillValue, setMassFillValue] = useState('')
  const [massFilling, setMassFilling]   = useState(false)
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [newEvent, setNewEvent]         = useState({ title: '', date: '', start_time: '', end_time: '', color: '#22c55e' })
  const [sendingReminder, setSendingReminder] = useState(false)
  const [showOutlook, setShowOutlook] = useState(false)
  const { outlookEvents, setOutlookEvents } = useOutlookEvents(showOutlook)
  const [dismissedOutlook, setDismissedOutlook] = useState<Set<string>>(new Set())
  const [hoursTab, setHoursTab] = useState<'hours' | 'team' | 'pay'>('hours')

  const text    = 'var(--text-primary)'
  const muted   = 'var(--text-muted)'
  const border  = 'var(--border-subtle)'
  const cardBg  = 'var(--surface-1)'
  const inputBg = 'var(--surface-2)'
  const gridBg  = dark ? '#060d1a' : '#f8fafc'
  const wkendBg = dark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.025)'

  // ─── Calendar math ──────────────────────────────────────────────────────────
  const today = new Date()
  const viewYear  = today.getFullYear() + Math.floor((today.getMonth() + monthOffset) / 12)
  const viewMonth = ((today.getMonth() + monthOffset) % 12 + 12) % 12
  const firstOfMonth  = new Date(viewYear, viewMonth, 1)
  const lastOfMonth   = new Date(viewYear, viewMonth + 1, 0)
  const startPad      = firstOfMonth.getDay() // 0=Sun
  const totalCells    = Math.ceil((startPad + lastOfMonth.getDate()) / 7) * 7

  const calDays: Date[] = []
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(firstOfMonth)
    d.setDate(1 - startPad + i)
    calDays.push(d)
  }

  // Compute Monday of any date's week (local YYYY-MM-DD)

  // ─── Pay period info for viewed month ───────────────────────────────────────
  const payPeriodsInView = getPayPeriodsForMonth(viewYear, viewMonth)
  // Prefer the period containing today, then one that starts in the viewed month, then any overlap
  const todayStr = toLocalDateStr(new Date())
  const primaryPP =
    payPeriodsInView.find(pp => todayStr >= pp.start && todayStr <= pp.end) ??
    payPeriodsInView.find(pp => {
      const s = new Date(pp.start + 'T12:00:00')
      return s.getMonth() === viewMonth && s.getFullYear() === viewYear
    }) ??
    payPeriodsInView[0]

  const ppWeekdays = primaryPP
    ? countWeekdays(new Date(primaryPP.start), new Date(primaryPP.end))
    : 0

  // ─── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const teamRow = await resolveEffectiveTeamRow<CurrentUser>(supabase, '*')
    if (!teamRow) return
    setCurrentUser(teamRow)

    const teamRes = await supabase.from('team').select('*').eq('active', true)
    setTeam(teamRes.data || [])

    // Load all team schedule defaults for team availability view
    const { data: allDefs } = await supabase.from('schedule_defaults').select('*')
    setAllTeamDefaults(allDefs || [])

    const currentWeekStart = getMondayStr(new Date())
    const { data: weekOvrs } = await supabase.from('schedule_overrides').select('*').eq('week_start', currentWeekStart)
    setAllTeamOverrides(weekOvrs || [])

    const { data: eventsData } = await supabase.from('calendar_events').select('*').order('date')
    setCalEvents(eventsData || [])

    setViewingId(v => v || teamRow.id)
    setLoading(false)
  }, [supabase])

  // Load Outlook dismissed from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dismissed-outlook')
      if (saved) setDismissedOutlook(new Set(JSON.parse(saved)))
    }
  }, [])

  const dismissOutlookEvent = (key: string) => {
    setDismissedOutlook(prev => {
      const next = new Set(prev)
      next.add(key)
      localStorage.setItem('dismissed-outlook', JSON.stringify([...next]))
      return next
    })
  }

  const resetDismissed = () => {
    setDismissedOutlook(new Set())
    localStorage.removeItem('dismissed-outlook')
  }

  const refreshTeamWeekOverrides = useCallback(async () => {
    const currentWeekStart = getMondayStr(new Date())
    const { data } = await supabase.from('schedule_overrides').select('*').eq('week_start', currentWeekStart)
    setAllTeamOverrides(data || [])
  }, [supabase])

  const loadScheduleData = useCallback(async () => {
    const targetId = viewingId
    if (!targetId) return

    // All weeks that touch this month
    const weekStarts = new Set<string>()
    calDays.forEach(d => {
      if (d.getDay() !== 0) weekStarts.add(getMondayStr(d))
    })
    const weekArr = Array.from(weekStarts)

    const [defRes, ovRes] = await Promise.all([
      supabase.from('schedule_defaults').select('*').eq('user_id', targetId),
      supabase.from('schedule_overrides').select('*').eq('user_id', targetId).in('week_start', weekArr),
    ])

    setDefaults(defRes.data || [])
    setOverrides(ovRes.data || [])

    // Load ALL productions for the viewed month (not just user's)
    const queryStart = new Date(firstOfMonth)
    queryStart.setDate(queryStart.getDate() - 1)
    const queryEnd = new Date(lastOfMonth)
    queryEnd.setDate(queryEnd.getDate() + 1)
    const prodsRes = await supabase
      .from('productions')
      .select('id,title,production_number,request_type_label,start_datetime')
      .not('start_datetime', 'is', null)
      .gte('start_datetime', toLocalDateStr(queryStart))
      .lte('start_datetime', toLocalDateStr(queryEnd) + 'T23:59:59')
    setProductions(prodsRes.data || [])

    // Pre-fill edit forms with current user's data
    const myDef = (defRes.data || []).find((d: ScheduleDefault) => d.user_id === targetId)
    if (myDef) setMyDefault({ monday: myDef.monday||'', tuesday: myDef.tuesday||'', wednesday: myDef.wednesday||'', thursday: myDef.thursday||'', friday: myDef.friday||'' })

    // Default override week = current week
    const todayMonday = getMondayStr(new Date())
    setOverrideWeek(todayMonday)
    const myOv = (ovRes.data || []).find((o: ScheduleOverride) => o.week_start === todayMonday)
    if (myOv) setMyOverride({ monday: myOv.monday||'', tuesday: myOv.tuesday||'', wednesday: myOv.wednesday||'', thursday: myOv.thursday||'', friday: myOv.friday||'', notes: myOv.notes||'' })
    else setMyOverride({ ...EMPTY_DEFAULT, notes: '' })
  }, [supabase, viewingId, viewYear, viewMonth])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { if (viewingId) loadScheduleData() }, [loadScheduleData, viewingId, monthOffset])

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  const getHoursForDay = (date: Date): string | null => {
    if (!viewingId) return null
    return resolveDayHours(viewingId, date, defaults, overrides)
  }

  const getProdsForDay = (date: Date): Production[] => {
    return productions.filter(p => {
      if (!p.start_datetime) return false
      const prodDate = new Date(p.start_datetime)
      return prodDate.getFullYear() === date.getFullYear() &&
             prodDate.getMonth()    === date.getMonth() &&
             prodDate.getDate()     === date.getDate()
    })
  }

  const getEventsForDay = (date: Date): CalendarEvent[] => {
    const ds = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return calEvents.filter(e => e.date === ds)
  }

  const getOutlookForDay = (date: Date) => {
    if (!showOutlook) return []
    const ds = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const dayProds = getProdsForDay(date)
    return outlookEvents.filter(e => {
      if (e.date !== ds) return false
      // Skip dismissed
      const key = `${e.date}|${e.title}`
      if (dismissedOutlook.has(key)) return false
      // Auto-match: skip if title closely matches a production on the same day
      // Smart matching: strips prefixes, compares keywords
      const normalize = (t: string) => t.toLowerCase().replace(/^(video|livestream|equipment|recording|csd|canyons?)\s*[-–—:]\s*/i, '').replace(/\b(csd|canyons?|district|school|elementary|middle|high)\b/gi, '').replace(/\d{4}/g, '').trim()
      const getWords = (t: string) => normalize(t).split(/\s+/).filter(w => w.length >= 3)
      const titleWords = getWords(e.title)
      const matched = dayProds.some(p => {
        const prodWords = getWords(p.title)
        if (titleWords.length === 0 || prodWords.length === 0) return false
        // Exact normalized match
        if (normalize(e.title) === normalize(p.title)) return true
        // Substring match on normalized
        const nt = normalize(e.title), np = normalize(p.title)
        if (nt.includes(np) || np.includes(nt)) return true
        // Keyword overlap: if 50%+ of the shorter title's words appear in the longer
        const shorter = titleWords.length <= prodWords.length ? titleWords : prodWords
        const longer = titleWords.length > prodWords.length ? titleWords : prodWords
        const overlap = shorter.filter(w => longer.some(lw => lw.includes(w) || w.includes(lw))).length
        return overlap >= Math.ceil(shorter.length * 0.5)
      })
      return !matched
    })
  }

  const saveEvent = async () => {
    if (!currentUser || !newEvent.title || !newEvent.date) return
    const { data, error } = await supabase.from('calendar_events').insert({ title: newEvent.title, date: newEvent.date, start_time: newEvent.start_time || null, end_time: newEvent.end_time || null, color: newEvent.color, created_by: currentUser.id }).select().single()
    if (error) { toast('Failed to save event', 'error'); return }
    if (data) setCalEvents(prev => [...prev, data])
    setNewEvent({ title: '', date: '', start_time: '', end_time: '', color: '#22c55e' })
    setShowAddEvent(false)
  }

  const deleteEvent = async (id: string) => {
    if (!confirm('Delete this event?')) return
    const { error } = await supabase.from('calendar_events').delete().eq('id', id)
    if (error) { toast('Failed to delete event', 'error'); return }
    setCalEvents(prev => prev.filter(e => e.id !== id))
  }

  const remindTeam = async () => {
    if (!currentUser) return
    setSendingReminder(true)
    try {
      const { data: { session } } = await supabase.auth.refreshSession()
      if (!session) { setSendingReminder(false); return }
      const activeTeam = team.filter(t => t.email && t.id !== currentUser.id)
      const monday = new Date()
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
      const friday = new Date(monday)
      friday.setDate(monday.getDate() + 4)
      const weekStr = `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${friday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      for (const member of activeTeam) {
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ type: 'calendar_reminder', recipientEmail: member.email, recipientName: member.name.split(' ')[0], subject: sanitizeEmailSubject(`Reminder: Fill in your schedule for ${weekStr}`), body: `Hey ${member.name.split(' ')[0]},\n\nPlease fill in your hours for the week of ${weekStr} in the Team Hub.\n\nThanks!`, actionUrl: '/dashboard/schedule', actionLabel: 'Open Team hours' }),
        })
      }
      toast(`Reminder sent to ${activeTeam.length} team member${activeTeam.length !== 1 ? 's' : ''}!`)
    } catch { toast('Failed to send reminders') }
    setSendingReminder(false)
  }

  const isInPayPeriod = (d: Date, pp: typeof primaryPP): boolean => {
    if (!pp) return false
    const s = new Date(pp.start)
    const e = new Date(pp.end)
    const check = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    s.setHours(0, 0, 0, 0); e.setHours(23, 59, 59, 999)
    return check >= s && check <= e
  }

  const isToday = (d: Date) =>
    d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()

  const isCurrentMonth = (d: Date) => d.getMonth() === viewMonth && d.getFullYear() === viewYear

  // ─── Pay period total hours ──────────────────────────────────────────────
  const ppTotalHours = (() => {
    if (!primaryPP) return 0
    let total = 0
    const cur = new Date(primaryPP.start)
    const end = new Date(primaryPP.end)
    end.setHours(23, 59, 59, 999)
    while (cur <= end) {
      const h = getHoursForDay(cur)
      if (h) total += parseHours(h)
      cur.setDate(cur.getDate() + 1)
    }
    return Math.round(total * 10) / 10
  })()

  // Weekly hours for each week visible in the calendar
  const getWeekHours = (weekStart: Date): number => {
    let total = 0
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      const h = getHoursForDay(d)
      if (h) total += parseHours(h)
    }
    return Math.round(total * 10) / 10
  }

  // ─── Save default ─────────────────────────────────────────────────────────
  const saveDefault = useCallback(async () => {
    if (!currentUser || !viewingId) return
    const existing = defaults.find(d => d.user_id === viewingId)
    if (existing) {
      const { error } = await supabase.from('schedule_defaults').update({ ...myDefault }).eq('id', existing.id)
      if (error) { toast('Failed to save default schedule', 'error'); return }
      setDefaults(prev => prev.map(d => d.id === existing.id ? { ...d, ...myDefault } : d))
      setAllTeamDefaults(prev => prev.map(d => d.id === existing.id ? { ...d, ...myDefault } : d))
    } else {
      const { data, error } = await supabase.from('schedule_defaults').insert({ user_id: viewingId, ...myDefault }).select().single()
      if (error) { toast('Failed to save default schedule', 'error'); return }
      if (data) {
        setDefaults(prev => [...prev, data])
        setAllTeamDefaults(prev => [...prev.filter(d => d.user_id !== viewingId), data])
      }
    }
    setEditingDefault(false)
  }, [currentUser, viewingId, defaults, myDefault, supabase])

  // ─── Save override ────────────────────────────────────────────────────────
  const saveOverride = useCallback(async () => {
    if (!currentUser || !viewingId || !overrideWeek) return
    const { notes, ...days } = myOverride
    const existing = overrides.find(o => o.user_id === viewingId && o.week_start === overrideWeek)
    if (existing) {
      const { error } = await supabase.from('schedule_overrides').update({ ...days, notes: notes || null }).eq('id', existing.id)
      if (error) { toast('Failed to save override', 'error'); return }
      setOverrides(prev => prev.map(o => o.id === existing.id ? { ...o, ...days, notes: notes || null } : o))
    } else {
      const { data, error } = await supabase.from('schedule_overrides').insert({ user_id: viewingId, week_start: overrideWeek, ...days, notes: notes || null }).select().single()
      if (error) { toast('Failed to save override', 'error'); return }
      if (data) setOverrides(prev => [...prev, data])
    }
    setEditingOverride(false)
    await refreshTeamWeekOverrides()
  }, [currentUser, viewingId, overrides, myOverride, overrideWeek, supabase, refreshTeamWeekOverrides])

  // ─── Save a single day override ──────────────────────────────────────────
  const saveDay = useCallback(async (date: Date, value: string) => {
    if (!currentUser || !viewingId) return
    const dow = date.getDay()
    if (dow === 0 || dow === 6) return
    const dayKey = getDayOfWeekKey(dow) as keyof DaySchedule
    const weekStart = getMondayStr(date)
    const existing = overrides.find(o => o.user_id === viewingId && o.week_start === weekStart)
    const trimmed = value.trim()
    if (existing) {
      const { error } = await supabase.from('schedule_overrides').update({ [dayKey]: trimmed || '' }).eq('id', existing.id)
      if (error) { toast('Failed to save day', 'error'); return }
      setOverrides(prev => prev.map(o => o.id === existing.id ? { ...o, [dayKey]: trimmed || '' } : o))
    } else {
      const insertRow: Record<string, string | null> = {
        user_id: viewingId, week_start: weekStart,
        monday: null, tuesday: null, wednesday: null, thursday: null, friday: null, notes: null,
        [dayKey]: trimmed || '',
      }
      const { data, error } = await supabase.from('schedule_overrides').insert(insertRow).select().single()
      if (error) { toast('Failed to save day', 'error'); return }
      if (data) setOverrides(prev => [...prev, data])
    }
    setEditingCell(null)
    await refreshTeamWeekOverrides()
  }, [currentUser, viewingId, overrides, supabase, refreshTeamWeekOverrides])

  // ─── Mass fill all weekdays in the viewed month ───────────────────────────
  const runMassFill = useCallback(async () => {
    if (!currentUser || !viewingId || !massFillValue.trim()) return
    setMassFilling(true)
    const val = massFillValue.trim()

    // Collect unique week_starts for all weekdays in the viewed month
    const weekMap = new Map<string, Set<keyof DaySchedule>>()
    calDays.forEach(d => {
      if (!isCurrentMonth(d)) return
      const dow = d.getDay()
      if (dow === 0 || dow === 6) return
      const ws = getMondayStr(d)
      if (!weekMap.has(ws)) weekMap.set(ws, new Set())
      weekMap.get(ws)!.add(getDayOfWeekKey(dow) as keyof DaySchedule)
    })

    for (const [weekStart, days] of weekMap) {
      const existing = overrides.find(o => o.user_id === viewingId && o.week_start === weekStart)
      const updates: Record<string, string> = {}
      days.forEach(d => { updates[d] = val })

      if (existing) {
        const { error } = await supabase.from('schedule_overrides').update(updates).eq('id', existing.id)
        if (error) { toast('Failed to apply mass fill', 'error'); setMassFilling(false); return }
        setOverrides(prev => prev.map(o => o.id === existing.id ? { ...o, ...updates } : o))
      } else {
        const insertRow = {
          user_id: viewingId, week_start: weekStart,
          monday: null as string | null, tuesday: null as string | null,
          wednesday: null as string | null, thursday: null as string | null,
          friday: null as string | null, notes: null as string | null,
          ...updates,
        }
        const { data, error } = await supabase.from('schedule_overrides').insert(insertRow).select().single()
        if (error) { toast('Failed to apply mass fill', 'error'); setMassFilling(false); return }
        if (data) setOverrides(prev => {
          const without = prev.filter(o => !(o.user_id === viewingId && o.week_start === weekStart))
          return [...without, data]
        })
      }
    }
    setShowMassFill(false)
    setMassFillValue('')
    setMassFilling(false)
    await refreshTeamWeekOverrides()
  }, [currentUser, viewingId, massFillValue, overrides, supabase, viewYear, viewMonth, refreshTeamWeekOverrides])

  // ─── Styles ───────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px',
    padding: '8px 12px', fontSize: '14px', color: text, fontFamily: 'inherit',
    outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  const isManager = currentUser?.role === 'Manager'
  const viewingMember = team.find(m => m.id === viewingId)
  const viewingOwnSchedule = viewingId === currentUser?.id

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <Loader />
    </div>
  )

  const monthLabel = firstOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: text, margin: 0 }}>Team hours</h1>
          <p style={{ fontSize: '14px', color: muted, margin: '2px 0 0' }}>{monthLabel}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Manager: person switcher */}
          {isManager && team.length > 1 && (
            <select
              value={viewingId || ''}
              onChange={e => setViewingId(e.target.value)}
              style={{ ...inputStyle, width: 'auto', minWidth: '140px', padding: '8px 12px' }}
            >
              {team.map(m => (
                <option key={m.id} value={m.id}>{m.id === currentUser?.id ? 'My schedule' : m.name}</option>
              ))}
            </select>
          )}
          {/* Month nav */}
          <button onClick={() => setMonthOffset(p => p - 1)} style={{ width: '38px', height: '38px', borderRadius: '8px', background: cardBg, border: `0.5px solid ${border}`, color: text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button onClick={() => setMonthOffset(0)} style={{ fontSize: '13px', padding: '0 14px', height: '38px', borderRadius: '8px', background: cardBg, border: `0.5px solid ${border}`, color: monthOffset === 0 ? '#5ba3e0' : muted, cursor: 'pointer', fontFamily: 'inherit', fontWeight: monthOffset === 0 ? 600 : 400 }}>
            Today
          </button>
          <button onClick={() => setMonthOffset(p => p + 1)} style={{ width: '38px', height: '38px', borderRadius: '8px', background: cardBg, border: `0.5px solid ${border}`, color: text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <button onClick={() => setShowAddEvent(true)} style={{ fontSize: '13px', padding: '0 14px', height: '38px', borderRadius: '8px', background: '#22c55e', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>+ Event</button>
          <button onClick={() => setShowOutlook(p => !p)} style={{ fontSize: '13px', padding: '0 14px', height: '38px', borderRadius: '8px', background: showOutlook ? '#0891b2' : 'var(--surface-2)', border: 'none', color: showOutlook ? '#fff' : muted, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>{showOutlook ? '📅 Outlook' : '📅 Outlook off'}</button>
          {isManager && <button onClick={remindTeam} disabled={sendingReminder} style={{ fontSize: '13px', padding: '0 14px', height: '38px', borderRadius: '8px', background: cardBg, border: `0.5px solid ${border}`, color: text, cursor: 'pointer', fontFamily: 'inherit', opacity: sendingReminder ? 0.6 : 1 }}>{sendingReminder ? 'Sending...' : '📧 Remind team'}</button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {(['hours', 'team', ...(isManager ? (['pay'] as const) : [])] as const).map(id => (
          <button
            key={id}
            type="button"
            onClick={() => setHoursTab(id)}
            style={{
              fontSize: '14px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: `0.5px solid ${hoursTab === id ? '#1e6cb5' : border}`,
              background: hoursTab === id ? 'rgba(30,108,181,0.12)' : cardBg,
              color: hoursTab === id ? '#5ba3e0' : muted,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: hoursTab === id ? 600 : 500,
            }}
          >
            {id === 'hours' ? 'My hours' : id === 'team' ? 'Team' : 'Pay periods'}
          </button>
        ))}
      </div>

      {/* ── Add event form ── */}
      {(hoursTab === 'hours' || hoursTab === 'pay') && showAddEvent && (
        <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: text, margin: 0 }}>Add event</h3>
            <button onClick={() => setShowAddEvent(false)} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '18px' }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 160px' }}>
              <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Title</label>
              <input value={newEvent.title} onChange={e => setNewEvent(p => ({ ...p, title: e.target.value }))} placeholder="Team meeting, PD day..." style={{ ...inputStyle, padding: '8px 10px', fontSize: '14px' }} />
            </div>
            <div style={{ flex: '0 0 140px' }}>
              <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Date</label>
              <input type="date" value={newEvent.date} onChange={e => setNewEvent(p => ({ ...p, date: e.target.value }))} style={{ ...inputStyle, padding: '8px 10px', fontSize: '14px' }} />
            </div>
            <div style={{ flex: '0 0 100px' }}>
              <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Start</label>
              <input type="time" value={newEvent.start_time} onChange={e => setNewEvent(p => ({ ...p, start_time: e.target.value }))} style={{ ...inputStyle, padding: '8px 10px', fontSize: '14px' }} />
            </div>
            <div style={{ flex: '0 0 100px' }}>
              <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>End</label>
              <input type="time" value={newEvent.end_time} onChange={e => setNewEvent(p => ({ ...p, end_time: e.target.value }))} style={{ ...inputStyle, padding: '8px 10px', fontSize: '14px' }} />
            </div>
            <div style={{ flex: '0 0 50px' }}>
              <label style={{ fontSize: '11px', color: muted, display: 'block', marginBottom: '3px' }}>Color</label>
              <input type="color" value={newEvent.color} onChange={e => setNewEvent(p => ({ ...p, color: e.target.value }))} style={{ width: '100%', height: '36px', border: `0.5px solid ${border}`, borderRadius: '8px', cursor: 'pointer', background: 'transparent' }} />
            </div>
            <button onClick={saveEvent} disabled={!newEvent.title || !newEvent.date} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: newEvent.title && newEvent.date ? '#1e6cb5' : 'var(--surface-2)', color: newEvent.title && newEvent.date ? '#fff' : muted, border: 'none', cursor: newEvent.title && newEvent.date ? 'pointer' : 'default', fontFamily: 'inherit', fontWeight: 500 }}>Add</button>
          </div>
        </div>
      )}

      {/* ── Pay period banner ── */}
      {hoursTab === 'pay' && primaryPP && (
        <div style={{ background: dark ? 'rgba(30,108,181,0.12)' : 'rgba(30,108,181,0.07)', border: `0.5px solid rgba(30,108,181,0.25)`, borderRadius: '10px', padding: '10px 16px', marginBottom: '16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 20px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#5ba3e0' }}>Pay Period {primaryPP.num}</span>
          <span style={{ fontSize: '13px', color: muted }}>
            {fmt(primaryPP.start, { month: 'short', day: 'numeric' })} – {fmt(primaryPP.end, { month: 'short', day: 'numeric' })}
          </span>
          <span style={{ fontSize: '13px', color: text, fontWeight: 500 }}>{ppWeekdays} weekdays</span>
          <span style={{ width: '1px', height: '14px', background: border, flexShrink: 0 }} />
          <span style={{ fontSize: '13px', color: ppTotalHours > 0 ? '#22c55e' : muted, fontWeight: 600 }}>{ppTotalHours}h scheduled</span>
          <span style={{ width: '1px', height: '14px', background: border, flexShrink: 0 }} />
          {(() => {
            const today = new Date()
            const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7)); monday.setHours(0,0,0,0)
            const weekHrs = getWeekHours(monday)
            const isIntern = viewingMember?.role === 'Intern'
            const overLimit = isIntern && weekHrs > 20
            return <span style={{ fontSize: '13px', color: overLimit ? '#ef4444' : weekHrs > 0 ? '#60b8f0' : muted, fontWeight: 600 }}>This week: {weekHrs}h{overLimit ? ' ⚠ Over 20h intern limit' : ''}</span>
          })()}
          <span style={{ width: '1px', height: '14px', background: border, flexShrink: 0 }} />
          <span style={{ fontSize: '13px', color: muted }}>Cutoff <strong style={{ color: text }}>{fmt(primaryPP.cutoff, { month: 'short', day: 'numeric' })}</strong></span>
          <span style={{ fontSize: '13px', color: muted }}>Payday <strong style={{ color: '#22c55e' }}>{fmt(primaryPP.payday, { month: 'short', day: 'numeric' })}</strong></span>
          <button onClick={() => {
            if (!primaryPP) return
            const lines: string[] = [`Pay Period ${primaryPP.num}: ${fmt(primaryPP.start, { month: 'short', day: 'numeric' })} – ${fmt(primaryPP.end, { month: 'short', day: 'numeric' })}`, `Name: ${currentUser?.name || ''}`, '']
            const cur = new Date(primaryPP.start); const end = new Date(primaryPP.end); end.setHours(23,59,59,999)
            while (cur <= end) {
              const dow = cur.getDay()
              if (dow !== 0 && dow !== 6) {
                const h = getHoursForDay(cur)
                lines.push(`${cur.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}: ${h || 'Off'}`)
              }
              cur.setDate(cur.getDate() + 1)
            }
            lines.push('', `Total: ${ppTotalHours}h`)
            navigator.clipboard.writeText(lines.join('\n'))
            toast('Hours copied to clipboard!', 'success')
          }} style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '6px', background: 'var(--surface-2)', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}>
            Copy hours
          </button>
          {payPeriodsInView.length > 1 && (
            <span style={{ fontSize: '12px', color: muted, marginLeft: 'auto' }}>+{payPeriodsInView.length - 1} more period{payPeriodsInView.length > 2 ? 's' : ''} this month</span>
          )}
        </div>
      )}

      {hoursTab === 'team' && !isManager && (
        <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
          <p style={{ fontSize: '14px', color: muted, margin: 0 }}>Team overview is available to managers. Use My hours to set your schedule.</p>
        </div>
      )}

      {/* ── Mass fill bar ── */}
      {hoursTab === 'hours' && (viewingOwnSchedule || isManager) && (
        <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {showMassFill ? (
            <>
              <span style={{ fontSize: '13px', color: muted }}>Fill all weekdays in {firstOfMonth.toLocaleDateString('en-US', { month: 'long' })} with:</span>
              <input
                autoFocus
                value={massFillValue}
                onChange={e => setMassFillValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') runMassFill(); if (e.key === 'Escape') setShowMassFill(false) }}
                placeholder="e.g. 9am-5pm"
                style={{ background: inputBg, border: `0.5px solid ${border}`, borderRadius: '8px', padding: '7px 12px', fontSize: '13px', color: text, fontFamily: 'inherit', outline: 'none', width: '140px' }}
              />
              <button onClick={runMassFill} disabled={massFilling || !massFillValue.trim()} style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: massFilling ? 'wait' : 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
                {massFilling ? 'Applying…' : 'Apply'}
              </button>
              <button onClick={() => { setShowMassFill(false); setMassFillValue('') }} style={{ fontSize: '13px', padding: '7px 12px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            </>
          ) : (
            <button onClick={() => setShowMassFill(true)} style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: cardBg, border: `0.5px solid ${border}`, color: muted, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Fill all weekdays
            </button>
          )}
        </div>
      )}

      {/* ── Team availability this week ── */}
      {hoursTab === 'team' && isManager && (
        <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '14px 18px', marginBottom: '16px' }}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: text, margin: '0 0 10px' }}>Team this week</p>
          <div style={{ display: 'grid', gridTemplateColumns: '120px repeat(5, 1fr)', gap: '1px', fontSize: '13px' }}>
            <div style={{ padding: '6px 0', color: muted, fontWeight: 500 }} />
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(d => (
              <div key={d} style={{ padding: '6px 0', textAlign: 'center' as const, color: muted, fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{d}</div>
            ))}
            {team.map(member => {
              const monday = new Date()
              monday.setHours(12, 0, 0, 0)
              monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
              return [
                <div key={`name-${member.id}`} style={{ padding: '6px 0', color: text, fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: member.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700, color: '#0a0f1e', flexShrink: 0 }}>{member.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}</div>
                  {member.name.split(' ')[0]}
                </div>,
                ...DAYS.map((dayKey, dayIdx) => {
                  const dayDate = new Date(monday)
                  dayDate.setDate(monday.getDate() + dayIdx)
                  const hrs = resolveDayHours(member.id, dayDate, allTeamDefaults, allTeamOverrides)
                  return <div key={`${member.id}-${dayKey}`} style={{ padding: '6px 0', textAlign: 'center' as const, color: hrs ? '#22c55e' : (dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'), fontSize: '12px', fontWeight: hrs ? 500 : 400 }}>{hrs || '—'}</div>
                })
              ]
            })}
          </div>
          <p style={{ fontSize: '11px', color: muted, margin: '8px 0 0' }}>This week&apos;s hours per person — weekly overrides when set, otherwise default schedules.</p>
        </div>
      )}

      {/* ── Calendar ── */}
      {(hoursTab === 'hours' || hoursTab === 'pay') && (
      <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', overflow: 'hidden', marginBottom: '20px' }}>
        {/* Day-of-week headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `0.5px solid ${border}` }}>
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => (
            <div key={d} style={{ padding: '10px 0', textAlign: 'center' as const, fontSize: '12px', fontWeight: 600, color: (i === 0 || i === 6) ? (dark ? 'rgba(136,153,187,0.5)' : 'rgba(107,114,128,0.5)') : muted, letterSpacing: '0.5px', textTransform: 'uppercase' as const, background: (i === 0 || i === 6) ? wkendBg : 'transparent' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {calDays.map((day, idx) => {
            const dow = day.getDay()
            const isWeekend = dow === 0 || dow === 6
            const inMonth = isCurrentMonth(day)
            const todayCell = isToday(day)
            const inPP = primaryPP ? isInPayPeriod(day, primaryPP) : false
            const hours = !isWeekend ? getHoursForDay(day) : null
            const dayProds = getProdsForDay(day)
            const dayEvents = getEventsForDay(day)
            const dayOutlook = getOutlookForDay(day)
            const isLastRow = idx >= totalCells - 7
            const isLastCol = dow === 6

            return (
              <div
                key={idx}
                style={{
                  minHeight: '90px',
                  padding: '6px 7px',
                  borderRight: isLastCol ? 'none' : `0.5px solid ${border}`,
                  borderBottom: isLastRow ? 'none' : `0.5px solid ${border}`,
                  background: isWeekend ? wkendBg : inPP && inMonth ? (dark ? 'rgba(30,108,181,0.04)' : 'rgba(30,108,181,0.025)') : 'transparent',
                  position: 'relative' as const,
                  opacity: inMonth ? 1 : 0.3,
                }}
              >
                {/* Day number + hours row */}
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', cursor: (!isWeekend && inMonth && (viewingOwnSchedule || isManager)) ? 'text' : 'default' }}
                  onClick={e => {
                    if (isWeekend || !inMonth || (!viewingOwnSchedule && !isManager)) return
                    const ds = toLocalDateStr(day)
                    setEditingCell({ dateStr: ds, value: hours || '' })
                  }}
                >
                  <span style={{
                    fontSize: '13px', fontWeight: todayCell ? 700 : 400,
                    color: todayCell ? '#fff' : isWeekend ? (dark ? 'rgba(136,153,187,0.5)' : 'rgba(107,114,128,0.5)') : text,
                    background: todayCell ? '#1e6cb5' : 'transparent',
                    width: '22px', height: '22px', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {day.getDate()}
                  </span>
                  {/* Inline edit input OR hours badge */}
                  {!isWeekend && inMonth && editingCell?.dateStr === toLocalDateStr(day) ? (
                    <input
                      autoFocus
                      value={editingCell.value}
                      onChange={e => setEditingCell(p => p ? { ...p, value: e.target.value } : p)}
                      onKeyDown={e => {
                        e.stopPropagation()
                        if (e.key === 'Enter') saveDay(day, editingCell.value)
                        if (e.key === 'Escape') setEditingCell(null)
                      }}
                      onBlur={() => saveDay(day, editingCell.value)}
                      onClick={e => e.stopPropagation()}
                      placeholder="9am-5pm"
                      style={{ fontSize: '10px', width: '68px', background: inputBg, border: `0.5px solid #1e6cb5`, borderRadius: '4px', padding: '1px 4px', color: text, fontFamily: 'inherit', outline: 'none' }}
                    />
                  ) : hours && inMonth ? (
                    <span
                      title="Click to edit"
                      style={{ fontSize: '10px', fontWeight: 500, color: '#5ba3e0', background: dark ? 'rgba(30,108,181,0.18)' : 'rgba(30,108,181,0.1)', borderRadius: '4px', padding: '1px 5px', whiteSpace: 'nowrap' as const, cursor: (!isWeekend && inMonth && (viewingOwnSchedule || isManager)) ? 'text' : 'default' }}>
                      {hours.replace(/\s/g, '')}
                    </span>
                  ) : !isWeekend && inMonth && (viewingOwnSchedule || isManager) ? (
                    <span style={{ fontSize: '10px', color: dark ? 'rgba(136,153,187,0.3)' : 'rgba(107,114,128,0.25)', padding: '1px 5px' }}>+</span>
                  ) : null}
                </div>

                {/* Production chips */}
                {dayProds.map(prod => {
                  const color = typeColor(prod.request_type_label)
                  const startTime = prod.start_datetime
                    ? new Date(prod.start_datetime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                    : null
                  const isHovered = hoveredProd === prod.id
                  return (
                    <div key={prod.id} style={{ position: 'relative' as const, marginBottom: '2px' }}>
                      <Link
                        href={`/dashboard/productions/${prod.production_number}`}
                        onMouseEnter={() => setHoveredProd(prod.id)}
                        onMouseLeave={() => setHoveredProd(null)}
                        style={{
                          display: 'block', fontSize: '10px', fontWeight: 500,
                          color: '#fff', background: color,
                          borderRadius: '4px', padding: '2px 5px',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                          textDecoration: 'none', lineHeight: 1.4,
                        }}
                      >
                        {prod.title.length > 18 ? prod.title.slice(0, 17) + '…' : prod.title}
                      </Link>
                      {/* Tooltip */}
                      {isHovered && (
                        <div style={{
                          position: 'absolute' as const, bottom: '100%', left: 0, zIndex: 50,
                          background: dark ? '#1a2540' : '#fff',
                          border: `0.5px solid ${border}`, borderRadius: '8px',
                          padding: '8px 10px', minWidth: '160px', maxWidth: '220px',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                          pointerEvents: 'none' as const,
                          marginBottom: '4px',
                        }}>
                          <p style={{ fontSize: '12px', fontWeight: 600, color: text, margin: '0 0 3px' }}>{prod.title}</p>
                          {prod.request_type_label && <p style={{ fontSize: '11px', color: muted, margin: '0 0 2px' }}>{prod.request_type_label}</p>}
                          {startTime && <p style={{ fontSize: '11px', color: '#5ba3e0', margin: 0, fontWeight: 500 }}>🕐 {startTime}</p>}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Calendar event chips */}
                {dayEvents.map(evt => (
                  <div key={evt.id} style={{ marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '2px' }}>
                    <span style={{ display: 'block', fontSize: '10px', fontWeight: 500, color: '#fff', background: evt.color || '#22c55e', borderRadius: '4px', padding: '2px 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, lineHeight: 1.4, flex: 1, cursor: 'default' }} title={evt.start_time ? `${evt.title} · ${evt.start_time}${evt.end_time ? '-' + evt.end_time : ''}` : evt.title}>
                      {evt.title.length > 18 ? evt.title.slice(0, 17) + '…' : evt.title}
                    </span>
                    <button onClick={e => { e.stopPropagation(); deleteEvent(evt.id) }} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '10px', padding: '0 2px', lineHeight: 1, opacity: 0.5 }}>×</button>
                  </div>
                ))}

                {/* Outlook calendar events */}
                {dayOutlook.map((evt, oi) => (
                  <div key={`ol-${oi}`} style={{ marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '2px' }}>
                    <span style={{ display: 'block', fontSize: '10px', fontWeight: 500, color: '#fff', background: '#0891b2', borderRadius: '4px', padding: '2px 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, lineHeight: 1.4, cursor: 'default', opacity: 0.85, flex: 1 }} title={`Outlook: ${evt.title}${evt.start_time ? ' · ' + new Date(evt.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}${evt.location ? ' · ' + evt.location : ''}`}>
                      {evt.title.length > 16 ? evt.title.slice(0, 15) + '…' : evt.title}
                    </span>
                    <button onClick={e => { e.stopPropagation(); dismissOutlookEvent(`${evt.date}|${evt.title}`) }} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '10px', padding: '0 2px', lineHeight: 1, opacity: 0.5 }}>×</button>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
      )}

      {/* ── Edit sections — only show for the person's own schedule ── */}
      {hoursTab === 'hours' && (viewingOwnSchedule || isManager) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>

          {/* Default schedule */}
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <p style={{ fontSize: '15px', fontWeight: 600, color: text, margin: 0 }}>My default schedule</p>
                <p style={{ fontSize: '13px', color: muted, margin: '2px 0 0' }}>Repeats every week</p>
              </div>
              {!editingDefault && (
                <button onClick={() => setEditingDefault(true)} style={{ fontSize: '13px', color: '#5ba3e0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
              )}
            </div>
            {editingDefault ? (
              <div>
                {DAYS.map((day, i) => (
                  <div key={day} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', color: muted, width: '80px', flexShrink: 0 }}>{DAY_LABELS[i]}</span>
                    <input
                      value={myDefault[day]}
                      onChange={e => setMyDefault(p => ({ ...p, [day]: e.target.value }))}
                      placeholder="9am-5pm or off"
                      style={{ ...inputStyle }}
                    />
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button onClick={saveDefault} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>Save</button>
                  <button onClick={() => setEditingDefault(false)} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div>
                {DAYS.map((day, i) => {
                  const val = defaults[0]?.[day]
                  return (
                    <div key={day} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 4 ? `0.5px solid ${border}` : 'none' }}>
                      <span style={{ fontSize: '14px', color: muted }}>{DAY_LABELS[i]}</span>
                      <span style={{ fontSize: '14px', fontWeight: 500, color: val ? text : muted }}>{val || '—'}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* This week override */}
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <p style={{ fontSize: '15px', fontWeight: 600, color: text, margin: 0 }}>This week only</p>
                <p style={{ fontSize: '13px', color: muted, margin: '2px 0 0' }}>Override your default</p>
              </div>
              {!editingOverride && (
                <button onClick={() => setEditingOverride(true)} style={{ fontSize: '13px', color: '#5ba3e0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
              )}
            </div>
            {editingOverride ? (
              <div>
                <div style={{ marginBottom: '10px' }}>
                  <p style={{ fontSize: '12px', color: muted, margin: '0 0 4px' }}>Week of</p>
                  <input
                    type="date"
                    value={overrideWeek}
                    onChange={e => {
                      setOverrideWeek(e.target.value)
                      const existing = overrides.find(o => o.week_start === e.target.value)
                      if (existing) setMyOverride({ monday: existing.monday||'', tuesday: existing.tuesday||'', wednesday: existing.wednesday||'', thursday: existing.thursday||'', friday: existing.friday||'', notes: existing.notes||'' })
                      else setMyOverride({ ...EMPTY_DEFAULT, notes: '' })
                    }}
                    style={inputStyle}
                  />
                </div>
                {DAYS.map((day, i) => (
                  <div key={day} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', color: muted, width: '80px', flexShrink: 0 }}>{DAY_LABELS[i]}</span>
                    <input
                      value={myOverride[day]}
                      onChange={e => setMyOverride(p => ({ ...p, [day]: e.target.value }))}
                      placeholder="9am-5pm, off, or leave blank"
                      style={{ ...inputStyle }}
                    />
                  </div>
                ))}
                <textarea
                  value={myOverride.notes}
                  onChange={e => setMyOverride(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Notes (optional)"
                  style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' as const, marginBottom: '10px', marginTop: '4px' }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={saveOverride} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>Save</button>
                  <button onClick={() => setEditingOverride(false)} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div>
                {DAYS.map((day, i) => {
                  const weekStart = getMondayStr(new Date())
                  const override = overrides.find(o => o.week_start === weekStart)
                  const val = override?.[day]
                  const defVal = defaults[0]?.[day]
                  return (
                    <div key={day} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 4 ? `0.5px solid ${border}` : 'none' }}>
                      <span style={{ fontSize: '14px', color: muted }}>{DAY_LABELS[i]}</span>
                      {val
                        ? <span style={{ fontSize: '14px', fontWeight: 500, color: '#f59e0b' }}>{val} <span style={{ fontSize: '11px', color: muted, fontWeight: 400 }}>overridden</span></span>
                        : <span style={{ fontSize: '14px', color: muted }}>{defVal || 'Using default'}</span>
                      }
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}