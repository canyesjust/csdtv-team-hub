'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
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

export function getStatusTone(prod: WeekProduction): keyof typeof statusTone {
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

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function dayHeaderLabel(day: Date, index: number): { primary: string; secondary: string } {
  if (index === 0) return { primary: 'Today', secondary: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
  if (index === 1) return { primary: 'Tomorrow', secondary: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
  return {
    primary: day.toLocaleDateString('en-US', { weekday: 'short' }),
    secondary: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }
}

function CalendarEvent({ prod }: { prod: WeekProduction }) {
  const router = useRouter()
  const tone = getStatusTone(prod)
  const accent = statusTone[tone].color
  const accentBg = statusTone[tone].background
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

  return (
    <div
      role="button"
      tabIndex={0}
      className="week-cal-event"
      onClick={() => router.push(`/dashboard/productions?prod=${prod.production_number}`)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          router.push(`/dashboard/productions?prod=${prod.production_number}`)
        }
      }}
      style={{
        background: accentBg,
        border: `1px solid ${accent}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: '8px',
        padding: '8px 8px 8px 7px',
        cursor: 'pointer',
        transition: 'transform var(--motion-fast) var(--ease-standard), box-shadow var(--motion-fast) var(--ease-standard)',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.transform = 'translateY(-1px)'
        el.style.boxShadow = 'var(--shadow-soft)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.transform = 'translateY(0)'
        el.style.boxShadow = 'none'
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: '11px',
          fontWeight: 700,
          color: accent,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {time}
      </p>
      <p
        style={{
          margin: '4px 0 0',
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          lineHeight: 1.35,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        #{prod.production_number} {prod.title}
      </p>
      <p
        style={{
          margin: '3px 0 0',
          fontSize: '10px',
          color: 'var(--text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap' as const,
        }}
      >
        {typeLabel}
        {loc ? ` · ${loc}` : ''}
        {prepPct !== null ? ` · ${prepPct}%` : ''}
      </p>
    </div>
  )
}

function CalendarDayColumn({
  day,
  index,
  productions,
}: {
  day: Date
  index: number
  productions: WeekProduction[]
}) {
  const isToday = index === 0
  const { primary, secondary } = dayHeaderLabel(day, index)
  const isEmpty = productions.length === 0

  return (
    <div
      className="week-cal-col"
      style={{
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        flex: '1 1 0',
      }}
    >
      <div
        style={{
          padding: '10px 8px',
          textAlign: 'center' as const,
          borderBottom: '1px solid var(--border-subtle)',
          background: isToday ? 'var(--surface-2)' : 'transparent',
          flexShrink: 0,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.3px',
            textTransform: 'uppercase' as const,
            color: isToday ? 'var(--brand-primary)' : 'var(--text-muted)',
          }}
        >
          {primary}
        </p>
        <p
          style={{
            margin: '2px 0 0',
            fontSize: '13px',
            fontWeight: 600,
            color: isToday ? 'var(--brand-primary)' : 'var(--text-primary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {secondary}
        </p>
      </div>

      <div
        className="week-cal-col-body"
        style={{
          flex: 1,
          padding: '8px 6px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          minHeight: '100px',
          background: isToday ? 'var(--surface-2)' : 'transparent',
        }}
      >
        {isEmpty ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
              border: '1px dashed var(--border-subtle)',
              minHeight: '72px',
            }}
          >
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center' as const, padding: '0 4px' }}>
              —
            </span>
          </div>
        ) : (
          productions.map(prod => <CalendarEvent key={prod.id} prod={prod} />)
        )}
      </div>
    </div>
  )
}

export function ThisWeekZone({ weekProductions }: ThisWeekZoneProps) {
  const buckets = useMemo(() => {
    const days: Date[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = 0; i < 7; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      days.push(d)
    }

    return days.map((day, index) => {
      const prods = weekProductions.filter(p => {
        if (!p.start_datetime) return false
        const start = new Date(p.start_datetime)
        return sameLocalDay(start, day)
      })
      return { day, index, productions: prods }
    })
  }, [weekProductions])

  const prodCount = weekProductions.length

  return (
    <section style={{ ...uiStyles.zoneSection, marginBottom: 0 }}>
      <ZoneHeader
        label="This week"
        hint={prodCount === 0 ? 'Next 7 days' : `${prodCount} production${prodCount > 1 ? 's' : ''}`}
        accent="var(--brand-primary)"
      />
      <div
        style={{
          ...uiStyles.card,
          padding: 0,
          overflow: 'hidden',
        }}
      >
        <div className="week-cal-scroll">
          <div className="week-cal-grid">
            {buckets.map(({ day, index, productions }) => (
              <CalendarDayColumn
                key={day.toISOString()}
                day={day}
                index={index}
                productions={productions}
              />
            ))}
          </div>
        </div>
      </div>
      <style>{`
        .week-cal-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .week-cal-grid {
          display: flex;
          min-width: 100%;
        }
        .week-cal-col {
          min-width: 0;
        }
        @media (max-width: 767px) {
          .week-cal-grid {
            min-width: 700px;
          }
          .week-cal-col {
            min-width: 100px;
          }
        }
        @media (min-width: 768px) {
          .week-cal-grid {
            display: grid;
            grid-template-columns: repeat(7, minmax(0, 1fr));
          }
          .week-cal-col {
            border-right: 1px solid var(--border-subtle);
          }
          .week-cal-col:last-child {
            border-right: none;
          }
        }
      `}</style>
    </section>
  )
}
