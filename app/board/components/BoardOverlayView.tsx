'use client'

import { useEffect, useState } from 'react'
import type { PublicChannelState } from '@/lib/board-meetings/public-output-state'
import type { PublicActiveMotion, PublicActiveVoteResult } from '@/lib/board-meetings/motion-types'
import { formatOffsetSeconds } from '@/lib/board-meetings/time-format'

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

function QrOverlay({ url, label }: { url: string; label: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void import('qrcode').then(({ default: QR }) => {
      QR.toDataURL(url, { width: 220, margin: 1 }).then(img => {
        if (!cancelled) setDataUrl(img)
      })
    })
    return () => { cancelled = true }
  }, [url])

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '32px',
        right: '32px',
        background: 'rgba(10, 15, 30, 0.92)',
        padding: '16px',
        borderRadius: '12px',
        textAlign: 'center',
        color: '#f0f4ff',
        fontFamily: 'system-ui, sans-serif',
        zIndex: 20,
      }}
    >
      {dataUrl ? (
        <img src={dataUrl} alt="QR code" width={220} height={220} style={{ display: 'block' }} />
      ) : (
        <div style={{ width: 220, height: 220, background: '#334155' }} />
      )}
      <p style={{ margin: '12px 0 0', fontSize: '16px', fontWeight: 600, maxWidth: '220px' }}>{label}</p>
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
      } catch { /* ignore */ }
    }
    load()
    const t = setInterval(load, 1500)
    return () => { cancelled = true; clearInterval(t) }
  }, [channelNumber])

  const root: React.CSSProperties = {
    minHeight: '100vh',
    background: 'transparent',
    padding: '24px',
    boxSizing: 'border-box',
    position: 'relative',
    fontFamily: 'system-ui, sans-serif',
  }

  if (!state?.active) {
    return (
      <div style={{ ...root, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#8899bb' }}>
        <p style={{ fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 8px' }}>CSDtv Board</p>
        <p style={{ fontSize: '18px', margin: 0 }}>No production active</p>
      </div>
    )
  }

  const b = state.state
  const item = state.current_item
  const mode = b?.mode || 'normal'
  const voteResult = b?.active_vote_result
  const activeMotion = b?.active_motion
  const showVoteResult = !!voteResult && (voteResult.remaining_seconds ?? 0) > 0
  const showMotion = !showVoteResult && !!activeMotion
  const showItem = b?.overlay_visible && mode === 'normal' && item && !showVoteResult && !showMotion
  const timer = state.timer
  const showTimer = timer?.show_on_broadcast && (timer.remaining_seconds ?? 0) > 0
  const qr = b?.active_qr

  if (mode === 'recess') {
    return (
      <div style={root}>
        <ModeBanner accent="#1e4a8a" title="Recess" message={b?.mode_message ?? null} />
        {qr && <QrOverlay url={qr.url} label={qr.label} />}
      </div>
    )
  }

  if (mode === 'technical_difficulties') {
    return (
      <div style={root}>
        <ModeBanner accent="#8b1a1a" title="Technical Difficulties" message={b?.mode_message ?? null} />
        {qr && <QrOverlay url={qr.url} label={qr.label} />}
      </div>
    )
  }

  return (
    <div style={root}>
      {showVoteResult && voteResult ? <VoteResultCard result={voteResult} /> : null}
      {showMotion && activeMotion ? <MotionCard motion={activeMotion} /> : null}
      {showItem && item ? (
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
          <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#8899bb', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {item.section_title} · {item.item_number}
          </p>
          <p style={{ margin: 0, fontSize: '22px', fontWeight: 600, lineHeight: 1.3 }}>{item.title}</p>
        </div>
      ) : null}
      {showTimer && timer ? (
        <TimerBadge timer={timer} />
      ) : null}
      {qr && <QrOverlay url={qr.url} label={qr.label} />}
    </div>
  )
}

function MotionCard({ motion }: { motion: PublicActiveMotion }) {
  const text = motion.motion_text.length > 200 ? `${motion.motion_text.slice(0, 200)}…` : motion.motion_text
  return (
    <div
      style={{
        maxWidth: '720px',
        background: 'rgba(10, 15, 30, 0.92)',
        borderLeft: '4px solid #f59e0b',
        padding: '16px 20px',
        borderRadius: '4px',
        color: '#f0f4ff',
        marginBottom: '12px',
      }}
    >
      <p style={{ margin: '0 0 8px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fbbf24' }}>
        {motion.motion_type === 'substitute' ? 'Substitute motion' : 'Motion on floor'}
        {motion.is_consent_block && motion.consent_block_label ? ` · ${motion.consent_block_label}` : ''}
      </p>
      <p style={{ margin: '0 0 10px', fontSize: '20px', fontWeight: 600, lineHeight: 1.35 }}>{text}</p>
      <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>
        Moved by {motion.moved_by_name}, seconded by {motion.seconded_by_name}
      </p>
    </div>
  )
}

function VoteResultCard({ result }: { result: PublicActiveVoteResult }) {
  const passed = result.result === 'passed'
  const yeaNames = result.votes.filter(v => v.vote === 'yea').map(v => v.person_name)
  const nayNames = result.votes.filter(v => v.vote === 'nay').map(v => v.person_name)
  return (
    <div
      style={{
        maxWidth: '800px',
        background: 'rgba(10, 15, 30, 0.95)',
        padding: '24px 28px',
        borderRadius: '8px',
        color: '#f0f4ff',
        border: `3px solid ${passed ? '#22c55e' : '#ef4444'}`,
      }}
    >
      <p style={{ margin: '0 0 8px', fontSize: '14px', opacity: 0.85 }}>{result.motion_text.slice(0, 120)}</p>
      <p style={{ margin: '0 0 8px', fontSize: '36px', fontWeight: 800, color: passed ? '#4ade80' : '#f87171' }}>
        MOTION {passed ? 'PASSED' : 'FAILED'}
      </p>
      <p style={{ margin: '0 0 16px', fontSize: '28px', fontWeight: 700 }}>
        {result.tally.yea} — {result.tally.nay}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
        <div><strong>Yea:</strong> {yeaNames.join(', ') || '—'}</div>
        <div><strong>Nay:</strong> {nayNames.join(', ') || '—'}</div>
      </div>
    </div>
  )
}

function TimerBadge({ timer }: { timer: NonNullable<PublicChannelState['timer']> }) {
  return (
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
      {timer.label}: {formatOffsetSeconds(timer.remaining_seconds)}
    </div>
  )
}
