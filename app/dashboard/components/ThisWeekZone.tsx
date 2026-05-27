'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/lib/theme'
import { ZoneHeader } from './ZoneHeader'
import { getSchoolName } from '@/lib/schools'
import { uiStyles, statusTone } from '@/lib/ui/styles'
import { dayDiffFromToday } from '@/lib/dashboard/day-diff'

export interface WeekProduction {
  id: string
  production_number: number
  title: string
  request_type_label: string | null
  type: string | null
  status: string | null
  school_year?: string | null
  start_datetime: string | null
  filming_location: string | null
  school_department: string | null
  checklist_items?: { id: string; title: string; completed: boolean }[]
  production_members?: { user_id: string; team: { name: string; avatar_color: string } | null }[]
}

interface ThisWeekZoneProps {
  weekProductions: WeekProduction[]
}

function getPrepPct(prod: WeekProduction): number | null {
  const items = prod.checklist_items ?? []
  if (items.length === 0) return null
  const done = items.filter(i => i.completed).length
  return Math.round((done / items.length) * 100)
}

function getStatusTone(prod: WeekProduction): keyof typeof statusTone {
  const days = dayDiffFromToday(prod.start_datetime)
  const members = prod.production_members?.length ?? 0
  const items = prod.checklist_items ?? []
  const prepPct = items.length > 0
    ? Math.round((items.filter(i => i.completed).length / items.length) * 100)
    : 0

  if (days !== null && days <= 1) {
    if (members === 0) return 'danger'
    if (items.length === 0) return 'danger'
    if (prepPct < 50) return 'danger'
  }
  if (days !== null && days <= 2) {
    if (members < 2) return 'warning'
    if (prepPct < 70) return 'warning'
  }
  return 'success'
}

function formatDayLabel(day: Date, index: number): string {
  const weekday = day.toLocaleDateString('en-US', { weekday: 'short' })
  const datePart = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (index === 0) return `TODAY · ${weekday} ${datePart}`
  if (index === 1) return `TOMORROW · ${weekday} ${datePart}`
  return `${weekday.toUpperCase()} ${datePart}`
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function ProductionCard({ prod }: { prod: WeekProduction }) {
  const router = useRouter()
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const tone = getStatusTone(prod)
  const accent = statusTone[tone].color
  const prepPct = getPrepPct(prod)

  const d = prod.start_datetime ? new Date(prod.start_datetime) : null
  const time = d
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '—'

  const loc =
    getSchoolName(prod.filming_location) ||
    getSchoolName(prod.school_department) ||
    prod.filming_location ||
    ''

  const typeLabel = prod.request_type_label || prod.type || 'Production'
  const subtitleParts = [typeLabel, loc]
  if (prepPct !== null) subtitleParts.push(`${prepPct}% prep`)
  const subtitle = subtitleParts.filter(Boolean).join(' · ')

  const members = (prod.production_members ?? []).map(m => m.team).filter(Boolean) as {
    name: string
    avatar_color: string
  }[]
  const avatarCap = isMobile ? 2 : 3

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/dashboard/productions?prod=${prod.production_number}`)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          router.push(`/dashboard/productions?prod=${prod.production_number}`)
        }
      }}
      style={{
        ...uiStyles.card,
        padding: '12px 16px',
        cursor: 'pointer',
        marginBottom: '8px',
        transition: 'border-color var(--motion-fast) var(--ease-standard)',
      }}
      onMouseEnter={e => {
        ;(e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-strong)'
      }}
      onMouseLeave={e => {
        ;(e.currentTarget as HTMLDivElement).style.borderColor = border
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <div
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: accent,
            flexShrink: 0,
            marginTop: '4px',
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' as const }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: text, flexShrink: 0 }}>{time}</span>
            <p
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: text,
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap' as const,
                flex: 1,
                minWidth: 0,
              }}
            >
              #{prod.production_number} {prod.title}
            </p>
          </div>
          <p style={{ fontSize: '12px', color: muted, margin: '4px 0 0' }}>{subtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
          {members.slice(0, avatarCap).map((m, i) => (
            <div
              key={i}
              title={m.name}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: m.avatar_color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '9px',
                fontWeight: 700,
                color: dark ? '#0a0f1e' : '#0a0f1e',
              }}
            >
              {m.name
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DayGroup({
  day,
  index,
  productions,
}: {
  day: Date
  index: number
  productions: WeekProduction[]
}) {
  const label = formatDayLabel(day, index)
  const isToday = index === 0
  const count = productions.length
  const headerColor = isToday ? 'var(--brand-primary)' : 'var(--text-muted)'

  return (
    <div style={{ marginBottom: '16px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '10px',
          marginBottom: '8px',
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.5px', color: headerColor }}>
          {label}
        </span>
        {count > 0 && (
          <span className="this-week-day-count" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {count} production{count > 1 ? 's' : ''}
          </span>
        )}
      </div>
      {count === 0 ? (
        <div
          style={{
            border: '1px dashed var(--border-subtle)',
            borderRadius: '12px',
            padding: '14px 16px',
            background: 'transparent',
          }}
        >
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Nothing scheduled</p>
        </div>
      ) : (
        productions.map(prod => <ProductionCard key={prod.id} prod={prod} />)
      )}
    </div>
  )
}

export function ThisWeekZone({ weekProductions }: ThisWeekZoneProps) {
  const dayBuckets = useMemo(() => {
    const days: Date[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = 0; i < 7; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      days.push(d)
    }

    return days.map(day => {
      const prods = weekProductions.filter(p => {
        if (!p.start_datetime) return false
        const start = new Date(p.start_datetime)
        return sameLocalDay(start, day)
      })
      return { day, productions: prods }
    })
  }, [weekProductions])

  return (
    <section style={uiStyles.zoneSection}>
      <ZoneHeader label="This week" hint="Next 7 days" accent="var(--brand-primary)" />
      {dayBuckets.map(({ day, productions }, index) => (
        <DayGroup key={day.toISOString()} day={day} index={index} productions={productions} />
      ))}
      <style>{`
        @media (max-width: 767px) {
          .this-week-day-count { display: none !important; }
        }
      `}</style>
    </section>
  )
}
