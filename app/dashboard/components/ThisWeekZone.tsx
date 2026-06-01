'use client'

import { useMemo } from 'react'
import { ZoneHeader } from './ZoneHeader'
import { useProductionDrawer } from './ProductionDrawerProvider'
import { getSchoolName } from '@/lib/schools'
import { uiStyles, statusTone } from '@/lib/ui/styles'
import { getProductionStatusTone } from '@/lib/dashboard/production-attention'

export interface WeekProduction {
  id: string
  production_number: number
  title: string
  request_type_label: string | null
  type: string | null
  status: string | null
  school_year?: string | null
  start_datetime: string | null
  start_datetime_label?: string | null
  event_date?: string | null
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
  return getProductionStatusTone(prod)
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return (parts[0] || '?').slice(0, 2).toUpperCase()
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
  const { openByProductionNumber } = useProductionDrawer()
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

  const crew = (prod.production_members ?? [])
    .map(m => m.team)
    .filter((t): t is { name: string; avatar_color: string } => Boolean(t))

  return (
    <div
      role="button"
      tabIndex={0}
      className="week-cal-event"
      onClick={() => openByProductionNumber(prod.production_number)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openByProductionNumber(prod.production_number)
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
          overflowWrap: 'anywhere' as const,
        }}
      >
        #{prod.production_number} {prod.title}
      </p>
      <p
        style={{
          margin: '3px 0 0',
          fontSize: '10px',
          color: 'var(--text-muted)',
          lineHeight: 1.3,
          overflowWrap: 'anywhere' as const,
        }}
      >
        {typeLabel}
        {loc ? ` · ${loc}` : ''}
        {prepPct !== null ? ` · ${prepPct}%` : ''}
      </p>
      <div style={{ margin: '6px 0 0' }}>
        {crew.length === 0 ? (
          <span style={{ fontSize: '10px', color: statusTone.warning.color, fontWeight: 600 }}>
            No crew assigned
          </span>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '4px' }}>
            {crew.map((m, i) => (
              <span
                key={`${m.name}-${i}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '999px',
                  padding: '1px 7px 1px 1px',
                }}
              >
                <span
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: m.avatar_color,
                    color: '#0a0f1e',
                    fontSize: '8px',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {getInitials(m.name)}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-primary)', fontWeight: 500 }}>
                  {m.name.split(' ')[0]}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
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
            min-width: 560px;
          }
          .week-cal-col {
            min-width: 80px;
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
