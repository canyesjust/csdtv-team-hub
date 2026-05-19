'use client'

import { useEffect, useMemo, useState } from 'react'
import type { PublicChannelState } from '@/lib/board-meetings/public-output-state'
import { CANYONS_LOGO_SRC, CSDTV_LOGO_SRC } from '@/app/board/components/BoardIdleBranding'

type BoardMember = {
  id: string
  display_name: string
  primary_title: string | null
  officer_position: string | null
  photo_path: string | null
  photo_url?: string | null
}

export function PrerollCountdownCard({ scheduledStart }: { scheduledStart: string | null }) {
  const [label, setLabel] = useState('Meeting begins shortly')

  useEffect(() => {
    if (!scheduledStart) return
    const tick = () => {
      const diff = Math.floor((new Date(scheduledStart).getTime() - Date.now()) / 1000)
      if (diff > 0) {
        const m = Math.floor(diff / 60)
        const s = diff % 60
        setLabel(`Meeting begins in ${m}:${String(s).padStart(2, '0')}`)
      } else {
        setLabel('Starting soon…')
      }
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [scheduledStart])

  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ margin: 0, fontSize: 'clamp(36px, 6vw, 64px)', fontWeight: 700, letterSpacing: '-0.02em' }}>{label}</p>
    </div>
  )
}

export function PrerollAgendaPreviewCard({ state }: { state: PublicChannelState }) {
  const highlights = useMemo(() => {
    const pool = [
      ...(state.current_item
        ? [{ id: state.current_item.id, item_number: state.current_item.item_number, title: state.current_item.title, type: state.current_item.type }]
        : []),
      ...state.upcoming_items,
    ]
    const action = pool.filter(i => i.type === 'action')
    const rest = pool.filter(i => i.type !== 'action')
    return [...action, ...rest].slice(0, 4)
  }, [state])

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      <p style={{ margin: '0 0 16px', fontSize: '14px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899bb' }}>
        Tonight&apos;s agenda
      </p>
      {highlights.length === 0 ? (
        <p style={{ margin: 0, fontSize: '20px', color: '#c5d0e8' }}>Agenda details available soon.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {highlights.map(h => (
            <li key={h.id} style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.06)', borderRadius: '8px' }}>
              <span style={{ fontSize: '13px', color: '#8899bb', marginRight: '10px' }}>{h.item_number}</span>
              <span style={{ fontSize: '18px', fontWeight: 600 }}>{h.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function PrerollMeetTheBoardCard({ rotateSeconds = 8 }: { rotateSeconds?: number }) {
  const [members, setMembers] = useState<BoardMember[]>([])
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    fetch('/api/board/public/board-members')
      .then(r => r.json())
      .then(b => setMembers(b.members || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (members.length <= 1) return
    const t = setInterval(() => setIdx(i => (i + 1) % members.length), rotateSeconds * 1000)
    return () => clearInterval(t)
  }, [members.length, rotateSeconds])

  const m = members[idx % Math.max(members.length, 1)]
  if (!m) {
    return <p style={{ textAlign: 'center', fontSize: '20px', color: '#c5d0e8' }}>Board roster coming soon.</p>
  }

  const img = m.photo_url || null
  return (
    <div style={{ textAlign: 'center', maxWidth: '480px', margin: '0 auto' }}>
      <div style={{ width: '160px', height: '160px', margin: '0 auto 20px', borderRadius: '12px', overflow: 'hidden', background: 'rgba(255,255,255,0.08)' }}>
        {img ? (
          <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 700, color: '#8899bb' }}>
            {m.display_name.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>
      <p style={{ margin: '0 0 6px', fontSize: '28px', fontWeight: 700 }}>{m.display_name}</p>
      <p style={{ margin: 0, fontSize: '16px', color: '#c5d0e8' }}>{m.primary_title || m.officer_position || 'Board member'}</p>
    </div>
  )
}

export function PrerollPastMeetingsCard({ productionNumber }: { productionNumber: number | null }) {
  const archiveUrl = typeof window !== 'undefined' && productionNumber
    ? `${window.location.origin}/board/meeting/${productionNumber}/archive`
    : null

  return (
    <div style={{ textAlign: 'center', maxWidth: '520px', margin: '0 auto' }}>
      <p style={{ margin: '0 0 12px', fontSize: '28px', fontWeight: 700 }}>Watch past meetings</p>
      <p style={{ margin: '0 0 20px', fontSize: '16px', color: '#c5d0e8' }}>Scan for meeting archives and recordings</p>
      {archiveUrl && <p style={{ margin: 0, fontSize: '14px', color: '#8899bb', wordBreak: 'break-all' }}>{archiveUrl}</p>}
    </div>
  )
}

export function PrerollCustomCard({ config }: { config: Record<string, unknown> | null }) {
  const message = typeof config?.message === 'string' ? config.message : 'Welcome'
  const imageUrl = typeof config?.image_url === 'string' ? config.image_url : null
  return (
    <div style={{ textAlign: 'center', maxWidth: '640px', margin: '0 auto' }}>
      {imageUrl && <img src={imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: '240px', objectFit: 'contain', marginBottom: '20px' }} />}
      <p style={{ margin: 0, fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 600, lineHeight: 1.35 }}>{message}</p>
    </div>
  )
}

export function PrerollBrandingStrip({ channelName, meetingTitle }: { channelName: string; meetingTitle: string }) {
  const [clock, setClock] = useState('')
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))
    tick()
    const t = setInterval(tick, 30_000)
    return () => clearInterval(t)
  }, [])

  return (
    <div
      style={{
        height: '80px',
        padding: '0 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <img src={CANYONS_LOGO_SRC} alt="Canyons" style={{ height: '36px', objectFit: 'contain' }} />
        <img src={CSDTV_LOGO_SRC} alt="CSDtv" style={{ height: '28px', objectFit: 'contain' }} />
      </div>
      <div style={{ textAlign: 'right' }}>
        <p style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>{meetingTitle}</p>
        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#8899bb' }}>{channelName} · {clock}</p>
      </div>
    </div>
  )
}
