'use client'

import { useMemo, useState } from 'react'
import type { PublicChannelState } from '@/lib/board-meetings/public-output-state'
import { useBoardChannelState } from '@/app/board/hooks/useBoardChannelState'
import BoardOutputDebugStrip from '@/app/board/components/BoardOutputDebugStrip'
import { formatOffsetSeconds } from '@/lib/board-meetings/time-format'
import { BoardBlankFullscreen } from '@/app/board/components/BoardBlankOutput'
import BoardIdleBranding from '@/app/board/components/BoardIdleBranding'
import LowerThirdBanner from '@/app/board/components/LowerThirdBanner'
import { fitMotionText, motionTextFitStyle } from '@/app/board/components/MotionFloorGraphics'

function MotionFloorBlock({ state }: { state: PublicChannelState['state'] }) {
  const vr = state?.active_vote_result
  const motion = state?.active_motion
  if (vr && (vr.remaining_seconds ?? 0) > 0) {
    const passed = vr.result === 'passed'
    return (
      <div style={{ marginTop: '16px', padding: '12px', borderRadius: '8px', background: passed ? '#ecfdf5' : '#fef2f2', border: `1px solid ${passed ? '#86efac' : '#fecaca'}` }}>
        <p style={{ margin: '0 0 4px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: passed ? '#166534' : '#991b1b' }}>
          {passed ? 'Motion passed' : 'Motion failed'} · {vr.tally.yea}–{vr.tally.nay}
        </p>
        <p style={{ ...motionTextFitStyle(vr.motion_text, 'live-compact'), margin: 0, color: '#334155' }}>{vr.motion_text}</p>
      </div>
    )
  }
  if (motion) {
    const isVoting = motion.status === 'voting'
    const hasMover = !!motion.moved_by_name
    const hasSeconder = !!motion.seconded_by_name
    const label = isVoting
      ? 'Voting open'
      : !hasMover
        ? 'Motion being made'
        : 'Motion on floor'
    return (
      <div style={{ marginTop: '16px', padding: '12px', borderRadius: '8px', background: isVoting ? '#eff6ff' : '#fffbeb', border: `1px solid ${isVoting ? '#93c5fd' : '#fde68a'}` }}>
        <p style={{ margin: '0 0 4px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: isVoting ? '#1d4ed8' : '#92400e' }}>
          {label}
        </p>
        {motion.motion_text?.trim() ? (
          <p style={{ ...motionTextFitStyle(fitMotionText(motion), 'live-compact'), margin: '0 0 6px', color: '#334155' }}>
            {fitMotionText(motion)}
          </p>
        ) : null}
        {hasMover && hasSeconder && (
          <p style={{ margin: 0, fontSize: '13px', color: '#78716c' }}>
            {motion.moved_by_name} · seconded by {motion.seconded_by_name}
          </p>
        )}
        {hasMover && !hasSeconder && (
          <p style={{ margin: 0, fontSize: '13px', color: '#78716c' }}>Moved by {motion.moved_by_name}</p>
        )}
      </div>
    )
  }
  return null
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  action: { bg: '#fef3c7', text: '#92400e' },
  information: { bg: '#dbeafe', text: '#1e40af' },
  procedural: { bg: '#f3f4f6', text: '#374151' },
  recognition: { bg: '#d1fae5', text: '#065f46' },
}

function TypePill({ type }: { type: string }) {
  const c = TYPE_COLORS[type] || TYPE_COLORS.procedural
  return (
    <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '999px', background: c.bg, color: c.text, textTransform: 'capitalize' }}>
      {type}
    </span>
  )
}

export default function BoardLiveView({
  channelNumber,
  initialChannelName,
}: {
  channelNumber: number
  initialChannelName?: string
}) {
  const { state, debugInfo } = useBoardChannelState(channelNumber, { livePriority: true })
  const [expandedPast, setExpandedPast] = useState(false)

  const meeting = state?.meeting
  const mode = state?.state?.mode || 'normal'
  const isLive = meeting?.broadcast_status === 'live'
  const isPrepared = meeting?.broadcast_status === 'prepared'

  const recessRemaining = useMemo(() => {
    if (mode !== 'recess' || !state?.state?.mode_started_at || !state.state.mode_duration_seconds) return null
    const end = new Date(state.state.mode_started_at).getTime() + state.state.mode_duration_seconds * 1000
    return Math.max(0, Math.floor((end - Date.now()) / 1000))
  }, [mode, state?.state?.mode_started_at, state?.state?.mode_duration_seconds, state])

  if (!state?.active) {
    const screenName = state?.channel_name || initialChannelName || `Channel ${channelNumber}`
    if (state?.show_channel_ident) {
      return <BoardIdleBranding screenName={screenName} variant="fullscreen" statusLine={null} />
    }
    return <BoardBlankFullscreen />
  }

  const item = state.current_item
  const doc = item?.documents?.[0]
  const lowerThird = state.state?.active_lower_third

  return (
    <div style={page}>
      <header style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e6cb5', letterSpacing: '0.04em' }}>CSDtv</span>
          {isLive && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#dc2626' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#dc2626', animation: 'pulse 1.5s infinite' }} />
              Live
            </span>
          )}
        </div>
        <h1 style={{ margin: '10px 0 4px', fontSize: '20px', fontWeight: 700, color: '#0f172a', lineHeight: 1.25 }}>{meeting?.title}</h1>
        <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
          {meeting?.type || 'Board Meeting'}
          {meeting?.date ? ` · ${new Date(meeting.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
        </p>
        {meeting?.location && <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>{meeting.location}</p>}
      </header>

      <main style={{ padding: '16px 20px 32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {(isPrepared || (!isLive && meeting?.scheduled_public_start)) && !isLive && (
          <section style={card}>
            <p style={{ margin: 0, fontWeight: 600, color: '#0f172a' }}>Meeting begins soon</p>
            {meeting?.scheduled_public_start && (
              <p style={{ margin: '8px 0 0', fontSize: '15px', color: '#64748b' }}>
                Scheduled for {new Date(meeting.scheduled_public_start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </p>
            )}
          </section>
        )}

        {mode === 'recess' && (
          <section style={{ ...card, background: '#eff6ff', borderColor: '#bfdbfe' }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '18px', color: '#1e40af' }}>We&apos;re on a short break</p>
            {recessRemaining != null && (
              <p style={{ margin: '8px 0 0', color: '#1e40af' }}>Back in {formatOffsetSeconds(recessRemaining)}</p>
            )}
            {state.state?.mode_message && <p style={{ margin: '8px 0 0', color: '#475569' }}>{state.state.mode_message}</p>}
          </section>
        )}

        {mode === 'technical_difficulties' && (
          <section style={{ ...card, background: '#fef2f2', borderColor: '#fecaca' }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '18px', color: '#991b1b' }}>Technical difficulties</p>
            {state.state?.mode_message && <p style={{ margin: '8px 0 0', color: '#7f1d1d' }}>{state.state.mode_message}</p>}
          </section>
        )}

        {mode === 'normal' && (isLive || isPrepared) && item && !state.state?.agenda_branding_hold && (
          <section style={card}>
            <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Now discussing</p>
            <ItemHeader item={item} />
            <h2 style={{ margin: '0 0 10px', fontSize: '22px', fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>{item.title}</h2>
            {item.presenters?.[0] && (
              <p style={{ margin: '0 0 12px', fontSize: '15px', color: '#475569' }}>
                {item.presenters[0].name}
                {item.presenters[0].title ? ` · ${item.presenters[0].title}` : ''}
              </p>
            )}
            {doc?.source_url && (
              <a href={doc.source_url} target="_blank" rel="noopener noreferrer" style={docBtn}>
                View document
              </a>
            )}
            <MotionFloorBlock state={state.state} />
          </section>
        )}

        {state.upcoming_items.length > 0 && (
          <section>
            <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Up next</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {state.upcoming_items.map(u => (
                <div key={u.id} style={{ ...card, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{u.item_number}</span>
                    <TypePill type={u.type} />
                  </div>
                  <p style={{ margin: 0, fontSize: '15px', fontWeight: 500, color: '#0f172a' }}>{u.title}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {state.completed_items.length > 0 && (
          <section>
            <button
              type="button"
              onClick={() => setExpandedPast(v => !v)}
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
                Already happened ({state.completed_items.length}) {expandedPast ? '▼' : '▶'}
              </p>
            </button>
            {expandedPast && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {state.completed_items.map(c => (
                  <div key={c.id} style={{ display: 'flex', gap: '12px', fontSize: '14px' }}>
                    <span style={{ fontFamily: 'ui-monospace, monospace', color: '#64748b', minWidth: '52px' }}>
                      {formatOffsetSeconds(c.started_at_offset_seconds)}
                    </span>
                    <span style={{ color: '#334155' }}><strong>{c.number}</strong> {c.title}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <footer style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
          {meeting?.youtube_url && isLive && (
            <a href={meeting.youtube_url} target="_blank" rel="noopener noreferrer" style={primaryBtn}>
              Watch live on YouTube
            </a>
          )}
          {meeting?.production_number && (
            <a href={`/board/meeting/${meeting.production_number}/archive`} style={secondaryBtn}>
              View past meetings
            </a>
          )}
        </footer>
      </main>
      {lowerThird ? (
        <LowerThirdBanner
          person={lowerThird}
          variant="live"
          position={state.state?.lower_third_position ?? 'left'}
        />
      ) : null}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
      {debugInfo ? <BoardOutputDebugStrip info={debugInfo} pollMs={state.poll_interval_ms} /> : null}
    </div>
  )
}

function ItemHeader({ item }: { item: NonNullable<PublicChannelState['current_item']> }) {
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e6cb5' }}>{item.item_number}</span>
      <TypePill type={item.type} />
    </div>
  )
}

const page: React.CSSProperties = {
  minHeight: '100vh',
  background: '#f8fafc',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  maxWidth: '420px',
  margin: '0 auto',
  boxSizing: 'border-box',
}

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '16px',
}

const docBtn: React.CSSProperties = {
  display: 'inline-block',
  padding: '10px 16px',
  background: '#1e6cb5',
  color: '#fff',
  borderRadius: '8px',
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: 600,
}

const primaryBtn: React.CSSProperties = {
  ...docBtn,
  textAlign: 'center',
}

const secondaryBtn: React.CSSProperties = {
  display: 'block',
  textAlign: 'center',
  padding: '12px',
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  color: '#1e6cb5',
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: '14px',
  background: '#fff',
}
