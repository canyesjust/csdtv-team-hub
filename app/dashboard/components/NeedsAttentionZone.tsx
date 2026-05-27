'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme'
import { ZoneHeader } from './ZoneHeader'
import { useProductionDrawer } from './ProductionDrawerProvider'
import { uiStyles, statusTone } from '@/lib/ui/styles'
import { dayDiffFromToday } from '@/lib/dashboard/day-diff'
import type { WeekProduction } from './ThisWeekZone'

interface NeedsAttentionZoneProps {
  understaffedProductions: WeekProduction[]
  lowPrepProductions: WeekProduction[]
  missingProdMetadata: WeekProduction[]
  ytEmailPendingCount: number
  ytMissingLinkCount: number
  crewSlotsTotal: number
  crewSlotsFilled: number
}

type AttentionTone = keyof typeof statusTone

interface AttentionItem {
  icon: string
  text: string
  tone: AttentionTone
  href: string
  productionNumber?: number
}

const VISIBLE_CAP = 5

function daysLabel(prod: WeekProduction): string {
  const days = dayDiffFromToday(prod.start_datetime)
  if (days === null) return 'soon'
  if (days < 0) return `${Math.abs(days)}d ago`
  return `${days}d`
}

export function NeedsAttentionZone({
  understaffedProductions,
  lowPrepProductions,
  missingProdMetadata,
  ytEmailPendingCount,
  ytMissingLinkCount,
  crewSlotsTotal,
  crewSlotsFilled,
}: NeedsAttentionZoneProps) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const rowHover = dark ? 'rgba(255,255,255,0.04)' : 'rgba(11,20,38,0.04)'
  const [expanded, setExpanded] = useState(false)
  const { openByProductionNumber } = useProductionDrawer()

  const items = useMemo(() => {
    const list: AttentionItem[] = []

    for (const prod of understaffedProductions) {
      list.push({
        icon: '⚠',
        text: `#${prod.production_number} ${prod.title} understaffed · ${daysLabel(prod)}`,
        tone: 'danger',
        href: `/dashboard/productions?prod=${prod.production_number}`,
        productionNumber: prod.production_number,
      })
    }

    for (const prod of lowPrepProductions) {
      list.push({
        icon: '⚠',
        text: `#${prod.production_number} ${prod.title} checklist behind · ${daysLabel(prod)}`,
        tone: 'warning',
        href: `/dashboard/productions?prod=${prod.production_number}`,
        productionNumber: prod.production_number,
      })
    }

    if (crewSlotsTotal > 0 && crewSlotsFilled / crewSlotsTotal < 0.7) {
      list.push({
        icon: '👥',
        text: `Crew slots ${crewSlotsFilled}/${crewSlotsTotal} filled`,
        tone: 'warning',
        href: '/dashboard/productions',
      })
    }

    if (ytMissingLinkCount > 0) {
      list.push({
        icon: '📺',
        text: `${ytMissingLinkCount} video${ytMissingLinkCount > 1 ? 's' : ''} missing production link`,
        tone: 'review',
        href: '/dashboard/videos',
      })
    }

    if (ytEmailPendingCount > 0) {
      list.push({
        icon: '📺',
        text: `${ytEmailPendingCount} video${ytEmailPendingCount > 1 ? 's' : ''} — email not sent`,
        tone: 'review',
        href: '/dashboard/productions?ytPending=1',
      })
    }

    for (const prod of missingProdMetadata.slice(0, 3)) {
      list.push({
        icon: '📅',
        text: `#${prod.production_number} ${prod.title} missing date or location`,
        tone: 'review',
        href: `/dashboard/productions?prod=${prod.production_number}`,
        productionNumber: prod.production_number,
      })
    }

    return list
  }, [
    understaffedProductions,
    lowPrepProductions,
    missingProdMetadata,
    ytEmailPendingCount,
    ytMissingLinkCount,
    crewSlotsTotal,
    crewSlotsFilled,
  ])

  const visibleItems = expanded ? items : items.slice(0, VISIBLE_CAP)
  const hiddenCount = items.length - VISIBLE_CAP
  const hasDanger = items.some(i => i.tone === 'danger')
  const accent = hasDanger ? 'var(--status-danger)' : 'var(--status-warning)'

  return (
    <section style={{ ...uiStyles.zoneSection, marginBottom: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ZoneHeader
        label="Needs attention"
        hint={items.length === 0 ? 'All clear' : `${items.length} item${items.length === 1 ? '' : 's'}`}
        accent={items.length === 0 ? 'var(--status-success)' : accent}
      />
      <div style={{ ...uiStyles.card, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, minHeight: '120px' }}>
        {items.length === 0 ? (
          <div style={{ padding: '20px 16px', textAlign: 'center' as const }}>
            <p style={{ fontSize: '22px', margin: '0 0 6px' }} aria-hidden>✓</p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontWeight: 500 }}>
              All clear — nothing needs attention
            </p>
          </div>
        ) : (
          <>
            {visibleItems.map((item, i) => {
              const rowStyle = {
                textDecoration: 'none' as const,
                display: 'flex',
                alignItems: 'stretch',
                gap: '8px',
                padding: '10px 14px',
                borderBottom:
                  i < visibleItems.length - 1 || (hiddenCount > 0 && !expanded)
                    ? '1px solid var(--border-subtle)'
                    : 'none',
                transition: 'background 0.1s',
                width: '100%',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left' as const,
              }
              const rowBody = (
                <>
                  <div
                    style={{
                      width: '3px',
                      borderRadius: '2px',
                      background: statusTone[item.tone].color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: '13px', flexShrink: 0, lineHeight: 1.4 }} aria-hidden>
                    {item.icon}
                  </span>
                  <span
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      fontWeight: 500,
                      flex: 1,
                      minWidth: 0,
                      lineHeight: 1.4,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {item.text}
                  </span>
                </>
              )
              if (item.productionNumber != null) {
                return (
                  <button
                    key={`${item.href}-${i}`}
                    type="button"
                    style={rowStyle}
                    onClick={() => openByProductionNumber(item.productionNumber!)}
                    onMouseEnter={e => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = rowHover
                    }}
                    onMouseLeave={e => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                    }}
                  >
                    {rowBody}
                  </button>
                )
              }
              return (
                <Link
                  key={`${item.href}-${i}`}
                  href={item.href}
                  style={rowStyle}
                  onMouseEnter={e => {
                    ;(e.currentTarget as HTMLAnchorElement).style.background = rowHover
                  }}
                  onMouseLeave={e => {
                    ;(e.currentTarget as HTMLAnchorElement).style.background = 'transparent'
                  }}
                >
                  {rowBody}
                </Link>
              )
            })}
            {hiddenCount > 0 && !expanded && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                style={{
                  background: 'var(--surface-2)',
                  border: 'none',
                  borderTop: '1px solid var(--border-subtle)',
                  padding: '10px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--link)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left' as const,
                }}
              >
                Show {hiddenCount} more
              </button>
            )}
            {expanded && items.length > VISIBLE_CAP && (
              <button
                type="button"
                onClick={() => setExpanded(false)}
                style={{
                  background: 'var(--surface-2)',
                  border: 'none',
                  borderTop: '1px solid var(--border-subtle)',
                  padding: '10px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left' as const,
                }}
              >
                Show less
              </button>
            )}
          </>
        )}
      </div>
    </section>
  )
}
