'use client'

import type { ControlBundle } from '@/lib/board-meetings/types'

type Props = {
  events: ControlBundle['recent_events']
}

export default function EventLogPanel({ events }: Props) {
  if (!events?.length) {
    return <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No events logged yet.</p>
  }

  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {events.slice(0, 20).map((ev, i) => (
        <li key={i} style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0', borderBottom: '0.5px solid var(--border-subtle)' }}>
          {new Date(ev.occurred_at || ev.created_at).toLocaleTimeString()} — {ev.event_type}
        </li>
      ))}
    </ul>
  )
}
