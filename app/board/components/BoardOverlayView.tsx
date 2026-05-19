'use client'

import { useEffect, useState } from 'react'
import type { PublicChannelState } from '@/lib/board-meetings/public-output-state'

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

const root: React.CSSProperties = {
  minHeight: '100vh',
  background: 'transparent',
  padding: '24px',
  boxSizing: 'border-box',
  position: 'relative',
  fontFamily: 'system-ui, sans-serif',
}

function ModeBanner({ accent, title, message }: { accent: string; title: string; message: string | null }) {
  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${accent} 0%, rgba(10,15,30,0.95) 100%)`,
        padding: '32px 40px',
        borderRadius: '8px',
        color: '#fff',
        maxWidth: '640px',
      }}
    >
      <p style={{ margin: 0, fontSize: '32px', fontWeight: 700 }}>{title}</p>
      {message ? <p style={{ margin: '12px 0 0', fontSize: '18px', opacity: 0.9 }}>{message}</p> : null}
    </div>
  )
}

export default function BoardOverlayView({ channelNumber }: { channelNumber: number }) {
  const [state, setState] = useState<PublicChannelState | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/board/output/${channelNumber}/state`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setState(data)
      } catch {
        /* poll errors ignored */
      }
    }
    load()
    const t = setInterval(load, 1500)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [channelNumber])

  const b = state?.broadcast
  const item = b?.current_item
  const showItem = state?.has_active_meeting && b?.overlay_visible && b?.mode === 'normal' && item
  const timer = b?.timer
  const showTimer = timer?.show_on_broadcast && (timer.remaining_seconds ?? 0) > 0

  if (!state?.has_active_meeting) {
    return (
      <div
        style={{
          ...root,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#8899bb',
        }}
      >
        <p style={{ fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 8px' }}>
          CSDtv Board
        </p>
        <p style={{ fontSize: '18px', margin: 0 }}>No production active</p>
      </div>
    )
  }

  if (b?.mode === 'recess') {
    return (
      <div style={root}>
        <ModeBanner accent="#1e4a8a" title="Recess" message={b.mode_message} />
      </div>
    )
  }

  if (b?.mode === 'technical_difficulties') {
    return (
      <div style={root}>
        <ModeBanner accent="#8b1a1a" title="Technical Difficulties" message={b.mode_message} />
      </div>
    )
  }

  return (
    <div style={root}>
      {showItem && item ? (
        <ItemCard item={item} />
      ) : null}
      {showTimer && timer ? (
        <div
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            background: 'rgba(10, 15, 30, 0.92)',
            padding: '12px 18px',
            borderRadius: '8px',
            color: '#f0f4ff',
            fontFamily: 'monospace',
            fontSize: '28px',
            fontWeight: 700,
          }}
        >
          {timer.label}: {formatTime(timer.remaining_seconds)}
        </div>
      ) : null}
    </div>
  )
}

function ItemCard({
  item,
}: {
  item: NonNullable<NonNullable<PublicChannelState['broadcast']>['current_item']>
}) {
  return (
    <div
      style={{
        maxWidth: '720px',
        background: 'rgba(10, 15, 30, 0.88)',
        borderLeft: '4px solid #3b82f6',
        padding: '16px 20px',
        borderRadius: '4px',
        color: '#f0f4ff',
      }}
    >
      <p
        style={{
          margin: '0 0 4px',
          fontSize: '13px',
          color: '#8899bb',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {item.section_title} · {item.item_number}
      </p>
      <p style={{ margin: 0, fontSize: '22px', fontWeight: 600, lineHeight: 1.3 }}>{item.title}</p>
    </div>
  )
}
