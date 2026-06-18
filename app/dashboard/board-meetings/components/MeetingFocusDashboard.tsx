'use client'

import Link from 'next/link'
import {
  formatScheduleInstant,
  parseProductionInstant,
} from '@/lib/board-meetings/meeting-schedule'

type MeetingRow = {
  id: string
  production_number: number
  title: string
  start_datetime: string | null
  event_date: string | null
  status: string | null
  board_meeting?: {
    broadcast_status: string
    agenda_locked: boolean
    agenda_locked_at: string | null
    agenda_extracted_at: string | null
    updated_at: string | null
    scheduled_public_start: string | null
  } | null
}

type AgendaItem = {
  id: string
  item_number: string
  title: string
  is_broadcastable: boolean
  needs_review: boolean
  updated_at?: string
}

type Detail = {
  board_meeting: {
    agenda_extracted_at: string | null
    agenda_locked: boolean
    agenda_locked_at: string | null
    updated_at: string
    broadcast_status: string
  } | null
  items: AgendaItem[]
}

function districtScheduleIso(row: MeetingRow): string | null {
  return row.start_datetime ?? row.event_date ?? null
}

function formatMeetingScheduleLine(row: MeetingRow): string {
  const district = districtScheduleIso(row)
  const broadcast = row.board_meeting?.scheduled_public_start ?? null
  if (!district && !broadcast) return 'Date TBD'
  if (!district && broadcast) {
    const b = formatScheduleInstant(broadcast)
    return b.timeLabel ? `${b.dateLabel} · ${b.timeLabel} (broadcast)` : `${b.dateLabel} (broadcast)`
  }
  const d = formatScheduleInstant(district!)
  let line = d.timeLabel ? `${d.dateLabel} · ${d.timeLabel}` : d.dateLabel
  if (broadcast) {
    const districtMs = parseProductionInstant(district!).getTime()
    const broadcastMs = parseProductionInstant(broadcast).getTime()
    if (!Number.isNaN(districtMs) && !Number.isNaN(broadcastMs) && Math.abs(districtMs - broadcastMs) > 60_000) {
      const b = formatScheduleInstant(broadcast)
      line += b.timeLabel ? ` · Broadcast ${b.dateLabel} · ${b.timeLabel}` : ` · Broadcast ${b.dateLabel}`
    }
  }
  return line
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  prepared: 'Prepared',
  live: 'Live',
  archived: 'Archived',
  cancelled: 'Cancelled',
  none: 'Not started',
}

export default function MeetingFocusDashboard({
  row,
  detail,
  detailLoading,
}: {
  row: MeetingRow
  detail: Detail | null
  detailLoading: boolean
}) {
  const text = 'var(--text-primary)'
  const muted = 'var(--text-muted)'
  const border = 'var(--border-subtle)'
  const cardBg = 'var(--surface-1)'

  const bm = detail?.board_meeting ?? row.board_meeting
  const items = detail?.items ?? []
  const itemCount = items.length
  const reviewCount = items.filter(i => i.needs_review).length
  const broadcastableCount = items.filter(i => i.is_broadcastable).length

  const status = bm?.broadcast_status ?? 'none'
  const statusLabel = STATUS_LABELS[status] ?? status
  const canControl = bm && ['prepared', 'live'].includes(bm.broadcast_status)

  const statusPill = (() => {
    if (status === 'live') return { bg: '#b3261e', fg: '#fff' }
    if (status === 'prepared') return { bg: 'var(--status-info-bg, rgba(31,108,180,0.15))', fg: 'var(--brand-primary-strong, #1f6cb4)' }
    if (status === 'archived') return { bg: 'var(--surface-2)', fg: muted }
    return { bg: 'var(--surface-2)', fg: muted }
  })()

  const metric = (label: string, value: string, accent?: string) => (
    <div style={{ background: 'var(--surface-2)', borderRadius: '8px', padding: '12px 14px' }}>
      <p style={{ margin: 0, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: muted }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 600, color: accent || text, lineHeight: 1.2 }}>{value}</p>
    </div>
  )

  return (
    <section
      style={{
        background: cardBg,
        border: `0.5px solid ${border}`,
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '16px 18px', borderBottom: `0.5px solid ${border}` }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: 'var(--brand-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Working meeting
              </p>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: '999px', background: statusPill.bg, color: statusPill.fg }}>{statusLabel}</span>
            </div>
            <h2 style={{ margin: '6px 0 4px', fontSize: '20px', fontWeight: 700, color: text, lineHeight: 1.25 }}>
              #{row.production_number} {row.title}
            </h2>
            <p style={{ margin: 0, fontSize: '14px', color: muted }}>{formatMeetingScheduleLine(row)}</p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {canControl && (
              <Link
                href={`/control/${row.id}`}
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'var(--brand-primary)',
                  color: '#fff',
                  textDecoration: 'none',
                  minHeight: '44px',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                Control
              </Link>
            )}
            <Link
              href={`/dashboard/board-meetings/${row.id}/agenda`}
              style={{
                fontSize: '13px',
                fontWeight: 600,
                padding: '10px 14px',
                borderRadius: '8px',
                border: `0.5px solid ${border}`,
                color: text,
                textDecoration: 'none',
                minHeight: '44px',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              Agenda editor
            </Link>
            {status === 'archived' && (
              <Link
                href={`/board/meeting/${row.production_number}/archive`}
                target="_blank"
                style={{
                  fontSize: '13px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: `0.5px solid ${border}`,
                  color: 'var(--brand-primary)',
                  textDecoration: 'none',
                  minHeight: '44px',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                Archive
              </Link>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 18px', borderBottom: `0.5px solid ${border}` }}>
        {detailLoading ? (
          <p style={{ margin: 0, fontSize: '13px', color: muted }}>Loading agenda…</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
              {metric('Agenda items', itemCount > 0 ? String(itemCount) : '—')}
              {metric('On air', itemCount > 0 ? String(broadcastableCount) : '—')}
              {metric('Needs review', reviewCount > 0 ? String(reviewCount) : 'None', reviewCount > 0 ? '#b45309' : undefined)}
              {metric('Agenda', bm?.agenda_locked ? 'Locked' : 'Unlocked')}
            </div>
            <p style={{ margin: '12px 0 0', fontSize: '12px', color: muted }}>
              Production: {row.status || '—'}
              {bm?.agenda_locked ? ` · agenda locked ${formatWhen(bm.agenda_locked_at)}` : ''}
            </p>
          </>
        )}
      </div>

      {!detailLoading && items.length > 0 && (
        <div style={{ padding: '14px 18px 16px' }}>
          <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 700, color: text }}>Agenda preview</p>
          <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: text, lineHeight: 1.5 }}>
            {items.slice(0, 8).map(it => (
              <li key={it.id} style={{ marginBottom: '4px' }}>
                <strong>{it.item_number}</strong> {it.title}
                {it.needs_review ? (
                  <span style={{ marginLeft: '6px', fontSize: '11px', color: '#b45309', fontWeight: 600 }}>review</span>
                ) : null}
              </li>
            ))}
          </ol>
          {items.length > 8 && (
            <p style={{ margin: '8px 0 0', fontSize: '12px', color: muted }}>
              +{items.length - 8} more in agenda editor
            </p>
          )}
        </div>
      )}
    </section>
  )
}
