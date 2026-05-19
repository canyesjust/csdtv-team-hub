'use client'

import { useEffect, useMemo, useState } from 'react'
import type { PublicChannelState } from '@/lib/board-meetings/public-output-state'

export default function BoardPrerollView({ channelNumber }: { channelNumber: number }) {
  const [state, setState] = useState<PublicChannelState | null>(null)
  const [cardIndex, setCardIndex] = useState(0)

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

  const cards = useMemo(() => {
    const preview = state?.agenda_preview || []
    if (preview.length === 0) {
      return [{ title: 'Board meeting starting soon', sub: state?.channel_name || `Channel ${channelNumber}` }]
    }
    return preview.map(p => ({ title: p.title, sub: p.item_number }))
  }, [state, channelNumber])

  useEffect(() => {
    if (cards.length <= 1) return
    const t = setInterval(() => setCardIndex(i => (i + 1) % cards.length), 8000)
    return () => clearInterval(t)
  }, [cards.length])

  const card = cards[cardIndex % cards.length]
  const ticker = state?.agenda_preview || []

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0a1628 0%, #0f1f3d 50%, #0a1628 100%)',
        color: '#f0f4ff',
        fontFamily: 'system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '20px 32px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: '14px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899bb' }}>
          Cherry Creek Schools
        </span>
        <span style={{ fontSize: '16px', fontWeight: 600 }}>{state?.channel_name || `Channel ${channelNumber}`}</span>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
        <div
          style={{
            maxWidth: '720px',
            textAlign: 'center',
            padding: '48px',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <p style={{ margin: '0 0 8px', fontSize: '14px', color: '#8899bb' }}>{card.sub}</p>
          <h1 style={{ margin: 0, fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 600, lineHeight: 1.25 }}>{card.title}</h1>
        </div>
      </div>

      {ticker.length > 0 && (
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.1)',
            padding: '14px 0',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              paddingLeft: '100%',
              animation: 'board-ticker 40s linear infinite',
              fontSize: '15px',
              color: '#c5d0e8',
            }}
          >
            {ticker.map((t, i) => (
              <span key={`${t.item_number}-${i}`} style={{ marginRight: '48px' }}>
                <strong style={{ color: '#fff' }}>{t.item_number}</strong> {t.title}
              </span>
            ))}
          </div>
          <style>{`@keyframes board-ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-100%); } }`}</style>
        </div>
      )}
    </div>
  )
}
