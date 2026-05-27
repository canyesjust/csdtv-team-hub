'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useTheme } from '@/lib/theme'
import { ZoneHeader } from './ZoneHeader'
import { uiStyles, statusTone } from '@/lib/ui/styles'
import { dayDiffFromToday } from '@/lib/dashboard/day-diff'
import type { WeekProduction } from './ThisWeekZone'

interface NeedsAttentionZoneProps {
  unstaffedProductions: WeekProduction[]
  understaffedProductions: WeekProduction[]
  atRiskProductions: WeekProduction[]
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
}

function daysLabel(prod: WeekProduction): string {
  const days = dayDiffFromToday(prod.start_datetime)
  if (days === null) return 'soon'
  if (days < 0) return `${Math.abs(days)}d ago`
  return `${days}d`
}

export function NeedsAttentionZone({
  unstaffedProductions,
  understaffedProductions,
  atRiskProductions,
  missingProdMetadata,
  ytEmailPendingCount,
  ytMissingLinkCount,
  crewSlotsTotal,
  crewSlotsFilled,
}: NeedsAttentionZoneProps) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const rowHover = dark ? 'rgba(255,255,255,0.04)' : 'rgba(11,20,38,0.04)'

  const items = useMemo(() => {
    const list: AttentionItem[] = []

    for (const prod of unstaffedProductions) {
      list.push({
        icon: '⚠',
        text: `#${prod.production_number} ${prod.title} has no crew · starts in ${daysLabel(prod)}`,
        tone: 'danger',
        href: `/dashboard/productions?prod=${prod.production_number}`,
      })
    }

    for (const prod of understaffedProductions) {
      list.push({
        icon: '⚠',
        text: `#${prod.production_number} ${prod.title} only has 1 crew member · starts in ${daysLabel(prod)}`,
        tone: 'warning',
        href: `/dashboard/productions?prod=${prod.production_number}`,
      })
    }

    for (const prod of atRiskProductions) {
      list.push({
        icon: '⚠',
        text: `#${prod.production_number} ${prod.title} prep below threshold · starts in ${daysLabel(prod)}`,
        tone: 'warning',
        href: `/dashboard/productions?prod=${prod.production_number}`,
      })
    }

    if (crewSlotsTotal > 0 && crewSlotsFilled / crewSlotsTotal < 0.7) {
      list.push({
        icon: '👥',
        text: `Student crew slots: ${crewSlotsFilled}/${crewSlotsTotal} filled across upcoming events`,
        tone: 'warning',
        href: '/dashboard/productions',
      })
    }

    if (ytMissingLinkCount > 0) {
      list.push({
        icon: '📺',
        text: `${ytMissingLinkCount} YouTube video${ytMissingLinkCount > 1 ? 's' : ''} missing link to production`,
        tone: 'review',
        href: '/dashboard/videos',
      })
    }

    if (ytEmailPendingCount > 0) {
      list.push({
        icon: '📺',
        text: `${ytEmailPendingCount} video${ytEmailPendingCount > 1 ? 's' : ''} with link, organizer email not sent`,
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
      })
    }

    return list
  }, [
    unstaffedProductions,
    understaffedProductions,
    atRiskProductions,
    missingProdMetadata,
    ytEmailPendingCount,
    ytMissingLinkCount,
    crewSlotsTotal,
    crewSlotsFilled,
  ])

  return (
    <section style={uiStyles.zoneSection}>
      <ZoneHeader
        label="Needs attention"
        hint={`${items.length} item${items.length === 1 ? '' : 's'}`}
        accent="var(--status-warning)"
      />
      <div style={{ ...uiStyles.card, overflow: 'hidden' }}>
        {items.length === 0 ? (
          <p style={{ padding: '16px', fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>
            All clear — nothing needs attention right now.
          </p>
        ) : (
          items.map((item, i) => (
            <Link
              key={`${item.href}-${i}`}
              href={item.href}
              style={{
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'stretch',
                gap: '10px',
                padding: '12px 16px',
                borderBottom: i < items.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => {
                ;(e.currentTarget as HTMLAnchorElement).style.background = rowHover
              }}
              onMouseLeave={e => {
                ;(e.currentTarget as HTMLAnchorElement).style.background = 'transparent'
              }}
            >
              <div
                style={{
                  width: '4px',
                  borderRadius: '2px',
                  background: statusTone[item.tone].color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: '14px', flexShrink: 0 }} aria-hidden>
                {item.icon}
              </span>
              <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500, flex: 1, minWidth: 0 }}>
                {item.text}
              </span>
            </Link>
          ))
        )}
      </div>
    </section>
  )
}
