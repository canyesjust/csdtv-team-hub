'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface CrewEvent {
  production_number: number
  title: string
  start_datetime: string | null
  location: string | null
  total_capacity: number
  total_filled: number
  open_spots: number
}

const colors = {
  bg: '#f8f9fc',
  cardBg: '#ffffff',
  border: 'rgba(0,0,0,0.08)',
  text: '#1a1f36',
  muted: '#6b7280',
  primary: '#1e6cb5',
  success: '#22c55e',
}

export default function CrewIndexPage() {
  const [events, setEvents] = useState<CrewEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/crew')
        if (!res.ok) {
          if (!cancelled) { setError('Could not load events'); setEvents([]) }
          return
        }
        const data = await res.json()
        if (!cancelled) setEvents(data.events || [])
      } catch {
        if (!cancelled) { setError('Network error — please try again'); setEvents([]) }
      }
    })()
    return () => { cancelled = true }
  }, [])

  const wrap = (children: React.ReactNode) => (
    <div style={{ minHeight: '100vh', background: colors.bg, fontFamily: 'system-ui, -apple-system, sans-serif', color: colors.text, paddingBottom: '40px' }}>
      <div style={{ background: colors.primary, color: '#fff', padding: '24px 20px' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase' as const, margin: '0 0 6px', opacity: 0.85 }}>CSDtv Crew Sign-Up</p>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 4px' }}>Open crew events</h1>
          <p style={{ fontSize: '14px', margin: 0, opacity: 0.9 }}>Pick an event below to see the positions and sign up.</p>
        </div>
      </div>
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '20px' }}>{children}</div>
    </div>
  )

  if (events === null) {
    return wrap(<p style={{ color: colors.muted, textAlign: 'center' as const, padding: '40px 0' }}>Loading...</p>)
  }

  if (events.length === 0) {
    return wrap(
      <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: '14px', padding: '40px 24px', textAlign: 'center' as const }}>
        <p style={{ fontSize: '18px', fontWeight: 600, color: colors.text, margin: '0 0 8px' }}>No events open right now</p>
        <p style={{ fontSize: '14px', color: colors.muted, margin: 0 }}>{error || 'Check back soon for new crew sign-ups.'}</p>
      </div>
    )
  }

  return wrap(
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
      {events.map(ev => {
        const date = ev.start_datetime ? new Date(ev.start_datetime) : null
        const dateStr = date ? date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Date TBD'
        const timeStr = date ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
        const isFull = ev.total_capacity > 0 && ev.open_spots === 0
        return (
          <Link
            key={ev.production_number}
            href={`/crew/${ev.production_number}`}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' as const }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <p style={{ fontSize: '16px', fontWeight: 600, color: colors.text, margin: '0 0 4px' }}>{ev.title}</p>
                <p style={{ fontSize: '13px', color: colors.muted, margin: 0 }}>
                  {dateStr}{timeStr && ` · ${timeStr}`}{ev.location && ` · ${ev.location}`}
                </p>
              </div>
              <div style={{ textAlign: 'right' as const }}>
                {isFull ? (
                  <span style={{ fontSize: '13px', fontWeight: 600, color: colors.muted, background: '#e2e8f0', padding: '6px 12px', borderRadius: '8px', display: 'inline-block' }}>Full</span>
                ) : (
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff', background: colors.primary, padding: '6px 12px', borderRadius: '8px', display: 'inline-block' }}>
                    {ev.total_capacity > 0 ? `${ev.open_spots} open` : 'Sign up'}
                  </span>
                )}
                {ev.total_capacity > 0 && (
                  <p style={{ fontSize: '11px', color: colors.muted, margin: '4px 0 0' }}>{ev.total_filled} of {ev.total_capacity} filled</p>
                )}
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
