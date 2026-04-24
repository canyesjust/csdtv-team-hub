'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { getSchoolName as getSchoolNameFallback } from '@/lib/schools'

interface Production {
  id: string; production_number: number; title: string
  request_type_label: string | null; status: string | null; school_year: string | null
  start_datetime: string | null; filming_location: string | null; school_department: string | null
  production_members?: { user_id: string; team: { name: string; avatar_color: string } | null }[]
}
interface TeamMember { id: string; name: string; avatar_color: string; role: string }
interface SchedDefault { id: string; user_id: string; monday: string; tuesday: string; wednesday: string; thursday: string; friday: string }
interface SchedOverride { id: string; user_id: string; week_start: string; monday: string; tuesday: string; wednesday: string; thursday: string; friday: string }

const TYPE_COLORS: Record<string, string> = {
  'Photo Headshots': '#f0b840', 'Create a Video(Film, Edit, Publish)': '#60b8f0', 'LiveStream Meeting': '#34d399',
  'Record Meeting': '#b8a0f0', 'Podcast': '#fb923c', 'Board Meeting': '#f87171', 'Other, Unsure, Or Consultation': '#94a3b8',
}
const TYPE_SHORT: Record<string, string> = {
  'Photo Headshots': 'Photo', 'Create a Video(Film, Edit, Publish)': 'Video', 'LiveStream Meeting': 'Livestream',
  'Record Meeting': 'Recording', 'Podcast': 'Podcast', 'Board Meeting': 'Board Mtg', 'Other, Unsure, Or Consultation': 'Other',
}
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const DOW_MAP: Record<number, string> = { 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday' }

function getSunday(d: Date): Date { const dt = new Date(d); dt.setDate(dt.getDate() - dt.getDay()); dt.setHours(0, 0, 0, 0); return dt }
function getMondayStr(d: Date): string { const dt = new Date(d); const day = dt.getDay(); dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day)); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}` }
function isSameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate() }
function getInitials(n: string) { const p = n.split(' '); return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : n.slice(0, 2).toUpperCase() }

export default function SignagePage() {
  const supabase = createClient()
  const [now, setNow] = useState(new Date())
  const [productions, setProductions] = useState<Production[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [schedDefaults, setSchedDefaults] = useState<SchedDefault[]>([])
  const [schedOverrides, setSchedOverrides] = useState<SchedOverride[]>([])
  const [schoolMap, setSchoolMap] = useState<Record<string, string>>({})
  const [calEvents, setCalEvents] = useState<{ id: string; title: string; date: string; start_time: string | null; color: string }[]>([])
  const [outlookEvents, setOutlookEvents] = useState<{ title: string; date: string; start_time: string | null; location: string | null }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t) }, [])

  const loadData = useCallback(async () => {
    const [prodsRes, teamRes, defsRes, ovrsRes, schoolsRes, eventsRes] = await Promise.all([
      supabase.from('productions').select('id, production_number, title, request_type_label, status, school_year, start_datetime, filming_location, school_department, production_members(user_id, team(name, avatar_color))').not('start_datetime', 'is', null).order('start_datetime'),
      supabase.from('team').select('id, name, avatar_color, role').eq('active', true),
      supabase.from('schedule_defaults').select('*'),
      supabase.from('schedule_overrides').select('*'),
      supabase.from('schools').select('code, name'),
      supabase.from('calendar_events').select('id, title, date, start_time, color').order('date'),
    ])
    setProductions((prodsRes.data as any) || [])
    setTeam(teamRes.data || [])
    setSchedDefaults(defsRes.data || [])
    setSchedOverrides(ovrsRes.data || [])
    setCalEvents(eventsRes.data || [])
    try { const ir = await fetch('/api/ical'); if (ir.ok) { const { events: oe } = await ir.json(); setOutlookEvents(oe || []) } } catch {}
    const m: Record<string, string> = {}
    ;(schoolsRes.data || []).forEach((s: any) => { m[s.code] = s.name })
    setSchoolMap(m)
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { const r = setInterval(() => loadData(), 300000); return () => clearInterval(r) }, [loadData])

  const getSchoolName = (code: string | null | undefined): string => {
    if (!code) return ''
    const c = code.toString(); const padded = c.padStart(3, '0'); const stripped = c.replace(/^0+/, '') || '0'
    return schoolMap[c] || schoolMap[padded] || schoolMap[stripped] || getSchoolNameFallback(code) || ''
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const sunday = getSunday(today)

  const weeks: Date[][] = []
  for (let w = 0; w < 5; w++) {
    const wd: Date[] = []
    for (let d = 0; d < 7; d++) { const dt = new Date(sunday); dt.setDate(dt.getDate() + (w * 7) + d); wd.push(dt) }
    weeks.push(wd)
  }

  const getProdsForDay = (date: Date) => {
    const ds = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const de = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59)
    return productions.filter(p => { if (!p.start_datetime) return false; const s = new Date(p.start_datetime); return s >= ds && s <= de })
  }

  const getHoursForUser = (userId: string): string | null => {
    const dow = today.getDay(); if (dow === 0 || dow === 6) return null
    const dayKey = DOW_MAP[dow]; if (!dayKey) return null
    const ws = getMondayStr(today)
    const ov = schedOverrides.find(o => o.user_id === userId && o.week_start === ws)
    if (ov && (ov as any)[dayKey]) return (ov as any)[dayKey]
    const def = schedDefaults.find(d => d.user_id === userId)
    return def ? ((def as any)[dayKey] || null) : null
  }

  const inProgressProds = productions.filter(p => p.status === 'In Progress')
  const endOfWeek = new Date(sunday); endOfWeek.setDate(endOfWeek.getDate() + 7)
  const thisWeekProds = productions.filter(p => { if (!p.start_datetime) return false; const d = new Date(p.start_datetime); return d >= sunday && d < endOfWeek })
  const currentSchoolYear = (() => { const m = now.getMonth(); const y = now.getFullYear(); return m >= 7 ? `${y + 1}` : `${y}` })()
  const ytdCompleted = productions.filter(p => p.status === 'Complete' && p.school_year === currentSchoolYear).length
  const ytdTotal = productions.filter(p => p.school_year === currentSchoolYear).length
  const nextProd = productions.find(p => { if (!p.start_datetime || p.status === 'Complete' || p.status === 'Cancelled') return false; return new Date(p.start_datetime) > now })
  const countdown = (() => {
    if (!nextProd?.start_datetime) return null
    const diff = new Date(nextProd.start_datetime).getTime() - now.getTime()
    if (diff <= 0) return null
    const hrs = Math.floor(diff / 3600000); const mins = Math.floor((diff % 3600000) / 60000)
    if (hrs >= 48) return { label: `${Math.ceil(hrs / 24)} days`, sub: nextProd.title }
    if (hrs >= 1) return { label: `${hrs}h ${mins}m`, sub: nextProd.title }
    return { label: `${mins}m`, sub: nextProd.title }
  })()

  const bg = '#070d18'; const cardBg = '#0f1828'; const text = '#eef2ff'; const muted = '#8899bb'; const dimmed = '#4a5670'
  const gridBorder = 'rgba(255,255,255,0.1)'

  if (loading) return <div style={{ background: bg, height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' as const }}><p style={{ color: muted, fontSize: '22px', fontFamily: 'system-ui' }}>Loading...</p></div>

  return (
    <div style={{ background: bg, height: '100vh', padding: '12px 16px', fontFamily: 'system-ui, -apple-system, sans-serif', color: text, display: 'flex', flexDirection: 'column' as const, boxSizing: 'border-box' as const, overflow: 'hidden' as const }}>

      {/* Row 1: Title + Clock */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexShrink: 0 }}>
        <div>
          <span style={{ fontSize: '26px', fontWeight: 700 }}>CSDtv Production Office</span>
          {countdown && <span style={{ marginLeft: '16px', fontSize: '14px', color: muted }}>Next shoot in <span style={{ fontSize: '24px', fontWeight: 800, color: '#60b8f0' }}>{countdown.label}</span> — {countdown.sub}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {team.map(m => {
            const hrs = getHoursForUser(m.id)
            return <span key={m.id} style={{ fontSize: '14px', color: hrs ? '#ccd5e8' : dimmed }}><span style={{ display: 'inline-block', width: '24px', height: '24px', borderRadius: '50%', background: m.avatar_color, textAlign: 'center' as const, lineHeight: '24px', fontSize: '10px', fontWeight: 700, color: '#0a0f1e', marginRight: '4px', verticalAlign: 'middle' }}>{getInitials(m.name)}</span>{m.name.split(' ')[0]} <span style={{ color: hrs ? '#34d399' : dimmed, fontWeight: 600 }}>{hrs || 'Off'}</span></span>
          })}
          <span style={{ fontSize: '18px', fontWeight: 500, color: '#ccd5e8' }}>{now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          <span style={{ fontSize: '32px', fontWeight: 800, color: '#60b8f0' }}>{now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
        </div>
      </div>

      {/* Row 2: Stats */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexShrink: 0, fontSize: '15px' }}>
        <span style={{ background: cardBg, border: `1px solid ${gridBorder}`, borderRadius: '8px', padding: '5px 12px' }}><span style={{ color: '#60b8f0', fontWeight: 700 }}>THIS WEEK</span> <span style={{ fontWeight: 600 }}>{thisWeekProds.length}</span> production{thisWeekProds.length !== 1 ? 's' : ''}</span>
        <span style={{ background: cardBg, border: `1px solid ${gridBorder}`, borderRadius: '8px', padding: '5px 12px' }}><span style={{ color: '#34d399', fontWeight: 700 }}>YEAR</span> <span style={{ fontWeight: 600 }}>{ytdCompleted}</span> completed of {ytdTotal}</span>
        {inProgressProds.length > 0 && <span style={{ background: cardBg, border: '1px solid rgba(251,191,36,0.2)', borderRadius: '8px', padding: '5px 12px' }}><span style={{ color: '#fbbf24', fontWeight: 700 }}>IN PROGRESS</span> {inProgressProds.map(p => p.title).join(' · ')}</span>}
      </div>

      {/* Calendar — single CSS grid: 8 cols × 6 rows */}
      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: '64px 0.5fr repeat(5, 1fr) 0.5fr',
        gridTemplateRows: 'auto repeat(5, 1fr)',
        border: `1px solid ${gridBorder}`, borderRadius: '8px', overflow: 'hidden' as const, minHeight: 0,
      }}>
        {/* Header row: 8 cells */}
        <div style={{ background: '#111d30', borderBottom: `1px solid ${gridBorder}`, borderRight: `1px solid ${gridBorder}`, padding: '6px' }} />
        {DOW.map((d, i) => {
          const isToday = isSameDay(weeks[0][i], today)
          return (
            <div key={d} style={{
              background: isToday ? 'rgba(96,184,240,0.08)' : '#111d30',
              borderBottom: `1px solid ${gridBorder}`, borderRight: i < 6 ? `1px solid ${gridBorder}` : 'none',
              padding: '8px', textAlign: 'center' as const, fontSize: '17px', fontWeight: 800,
              color: isToday ? '#60b8f0' : '#ccd5e8', letterSpacing: '1px',
            }}>{d}</div>
          )
        })}

        {/* 5 week rows: each row = 8 cells */}
        {weeks.map((weekDates, wi) => {
          const isThisWeek = isSameDay(weekDates[0], sunday)
          const weekLabel = isThisWeek ? 'This week' : weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

          return [
            /* Week label cell */
            <div key={`label-${wi}`} style={{
              background: isThisWeek ? 'rgba(96,184,240,0.06)' : 'transparent',
              borderBottom: wi < 4 ? `1px solid ${gridBorder}` : 'none',
              borderRight: `1px solid ${gridBorder}`,
              padding: '8px 4px', fontSize: '14px', fontWeight: 700,
              color: isThisWeek ? '#60b8f0' : muted, textAlign: 'center' as const,
              display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '8px',
            }}>{weekLabel}</div>,

            /* 7 day cells */
            ...weekDates.map((date, di) => {
              const dayProds = getProdsForDay(date)
              const past = date < today && !isSameDay(date, today)
              const todayCell = isSameDay(date, today)
              const isWeekend = di === 0 || di === 6
              const hasActive = dayProds.some(p => p.status === 'In Progress')
              const opacity = past ? (hasActive ? 0.8 : 0.3) : 1

              return (
                <div key={`${wi}-${di}`} style={{
                  background: todayCell ? 'rgba(96,184,240,0.08)' : isWeekend ? 'rgba(255,255,255,0.01)' : 'transparent',
                  borderBottom: wi < 4 ? `1px solid ${gridBorder}` : 'none',
                  borderRight: di < 6 ? `1px solid ${gridBorder}` : 'none',
                  borderLeft: todayCell ? '3px solid #60b8f0' : 'none',
                  padding: '2px 3px', opacity, overflow: 'hidden' as const,
                }}>
                  {(() => {
                    const ds = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                    const dayEvts = calEvents.filter(e => e.date === ds)
                    // Outlook events with auto-dedup against productions
                    const dayOl = outlookEvents.filter(e => {
                      if (e.date !== ds) return false
                      const normalize = (t: string) => t.toLowerCase().replace(/^(video|livestream|equipment|recording|csd|canyons?)\s*[-–—:]\s*/i, '').replace(/\b(csd|canyons?|district|school|elementary|middle|high)\b/gi, '').replace(/\d{4}/g, '').trim()
                      const getWords = (t: string) => normalize(t).split(/\s+/).filter(w => w.length >= 3)
                      const titleWords = getWords(e.title)
                      return !dayProds.some(p => {
                        const prodWords = getWords(p.title)
                        if (titleWords.length === 0 || prodWords.length === 0) return false
                        const nt = normalize(e.title), np = normalize(p.title)
                        if (nt === np || nt.includes(np) || np.includes(nt)) return true
                        const shorter = titleWords.length <= prodWords.length ? titleWords : prodWords
                        const longer = titleWords.length > prodWords.length ? titleWords : prodWords
                        const overlap = shorter.filter(w => longer.some(lw => lw.includes(w) || w.includes(lw))).length
                        return overlap >= Math.ceil(shorter.length * 0.5)
                      })
                    })
                    const n = dayProds.length + dayEvts.length + dayOl.length
                    const s = n <= 3 ? 1 : Math.max(0.55, 3 / n)
                    return <>
                  <div style={{ fontSize: `${Math.round(18 * s)}px`, color: todayCell ? '#60b8f0' : '#c0ccdd', fontWeight: todayCell ? 800 : 600, textAlign: 'right' as const, marginBottom: `${Math.round(2 * s)}px` }}>{date.getDate()}</div>
                  {dayProds.map(p => {
                    const tc = TYPE_COLORS[p.request_type_label || ''] || '#94a3b8'
                    const members = p.production_members || []
                    const ini = members.map(m => m.team ? getInitials(m.team.name) : '').filter(Boolean).join(' ')
                    const done = p.status === 'Complete'
                    const active = p.status === 'In Progress'
                    const d = p.start_datetime ? new Date(p.start_datetime) : null
                    const time = d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
                    const loc = getSchoolName(p.filming_location) || p.filming_location || getSchoolName(p.school_department) || ''
                    return (
                      <div key={p.id} style={{
                        padding: `${Math.round(3 * s)}px ${Math.round(5 * s)}px`, marginBottom: `${Math.round(2 * s)}px`, borderRadius: '3px',
                        background: done ? 'rgba(255,255,255,0.02)' : `${tc}22`,
                        borderLeft: `3px solid ${done ? '#555' : tc}`,
                        opacity: done ? 0.4 : 1,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: `${Math.round(18 * s)}px`, fontWeight: active ? 800 : 700, color: done ? dimmed : tc, flex: 1, overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const, textDecoration: done ? 'line-through' : 'none', lineHeight: 1.2 }}>{p.title}</span>
                          {ini && <span style={{ fontSize: `${Math.round(13 * s)}px`, color: done ? dimmed : '#c0ccdd', fontWeight: 500, flexShrink: 0 }}>{ini}</span>}
                        </div>
                        {(time || loc) && !done && (
                          <div style={{ fontSize: `${Math.round(15 * s)}px`, color: '#b0c8e0', fontWeight: 400, overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const, lineHeight: 1.3 }}>
                            {time}{time && loc ? ' · ' : ''}{loc}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {dayEvts.map(evt => (
                    <div key={evt.id} style={{
                      padding: `${Math.round(3 * s)}px ${Math.round(5 * s)}px`, marginBottom: `${Math.round(2 * s)}px`, borderRadius: '3px',
                      background: `${evt.color || '#22c55e'}22`,
                      borderLeft: `3px solid ${evt.color || '#22c55e'}`,
                    }}>
                      <span style={{ fontSize: `${Math.round(18 * s)}px`, fontWeight: 700, color: evt.color || '#22c55e', overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const, display: 'block', lineHeight: 1.2 }}>{evt.title}</span>
                      {evt.start_time && <div style={{ fontSize: `${Math.round(15 * s)}px`, color: '#b0c8e0', lineHeight: 1.3 }}>{evt.start_time}</div>}
                    </div>
                  ))}
                  {dayOl.map((evt, oi) => (
                    <div key={`ol-${oi}`} style={{
                      padding: `${Math.round(3 * s)}px ${Math.round(5 * s)}px`, marginBottom: `${Math.round(2 * s)}px`, borderRadius: '3px',
                      background: 'rgba(155,89,182,0.15)',
                      borderLeft: '3px solid #9b59b6',
                    }}>
                      <span style={{ fontSize: `${Math.round(18 * s)}px`, fontWeight: 700, color: '#9b59b6', overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const, display: 'block', lineHeight: 1.2 }}>{evt.title}</span>
                      {evt.start_time && <div style={{ fontSize: `${Math.round(15 * s)}px`, color: '#b0c8e0', lineHeight: 1.3 }}>{new Date(evt.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>}
                    </div>
                  ))}
                    </>
                  })()}
                </div>
              )
            }),
          ]
        })}
      </div>
    </div>
  )
}