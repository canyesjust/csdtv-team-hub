'use client'

import { useMemo } from 'react'
import { useBoardChannelState } from '@/app/board/hooks/useBoardChannelState'
import { youtubeEmbedUrlFromStreamUrl } from '@/lib/signage/stream-url'

// District-screen "live" takeover: the YouTube stream on the left, a flat
// broadcast-grade agenda sidebar on the right showing what's on now and up next.
// Matches the dais redesign palette (Canyons navy + amber, flat panels).

const C = {
  bg: '#102441',
  panel: '#19315a',
  line: 'rgba(255,255,255,0.12)',
  text: '#f4f7fc',
  soft: '#9bb0d0',
  dim: '#7f97bd',
  amber: '#f5b53f',
}

export default function BoardStreamView({
  channelNumber,
  audio = false,
}: {
  channelNumber: number
  audio?: boolean
}) {
  const { state } = useBoardChannelState(channelNumber, { livePriority: true })
  const meeting = state?.meeting
  const embed = useMemo(
    () => (meeting?.youtube_url ? youtubeEmbedUrlFromStreamUrl(meeting.youtube_url, { controls: false, captions: true, muted: !audio }) : null),
    [meeting?.youtube_url, audio],
  )
  const item = state?.current_item
  const upcoming = state?.upcoming_items ?? []
  const mode = state?.state?.mode ?? 'normal'

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', background: '#000', overflow: 'hidden', fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
        {embed ? (
          <iframe
            src={embed}
            title="Board meeting live stream"
            style={{ width: '100%', height: '100%', border: 'none' }}
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
          />
        ) : (
          <div style={{ color: C.soft, fontSize: 18 }}>Live stream starting…</div>
        )}
      </div>

      <aside style={{ width: '27vw', maxWidth: 460, minWidth: 300, height: '100%', background: C.bg, color: C.text, display: 'flex', flexDirection: 'column', borderLeft: `1px solid ${C.line}` }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: `2px solid ${C.amber}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.14em' }}>CANYONS</div>
          <div style={{ fontSize: 11, color: C.soft, letterSpacing: '0.16em', textTransform: 'uppercase', marginTop: 2 }}>Board of Education</div>
          {meeting?.title && <div style={{ fontSize: 13, color: C.soft, marginTop: 8, lineHeight: 1.3 }}>{meeting.title}</div>}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {mode === 'recess' ? (
            <div style={{ background: C.panel, borderLeft: `4px solid ${C.amber}`, borderRadius: 8, padding: '16px 18px' }}>
              <div style={{ fontSize: 11, color: C.amber, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>Recess</div>
              <div style={{ fontSize: 16, color: C.text }}>{state?.state?.mode_message || "We'll return shortly."}</div>
            </div>
          ) : mode === 'technical_difficulties' ? (
            <div style={{ background: C.panel, borderLeft: '4px solid #f06363', borderRadius: 8, padding: '16px 18px' }}>
              <div style={{ fontSize: 11, color: '#f06363', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>Technical difficulties</div>
              <div style={{ fontSize: 16, color: C.text }}>{state?.state?.mode_message || 'Please stand by.'}</div>
            </div>
          ) : item ? (
            <div style={{ background: C.panel, borderLeft: `4px solid ${C.amber}`, borderRadius: 8, padding: '16px 18px', marginBottom: 18 }}>
              <div style={{ fontSize: 11, color: C.amber, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>On now</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 14, color: C.soft, fontWeight: 600 }}>{item.item_number}</span>
                <span style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.25 }}>{item.title}</span>
              </div>
              {item.presenters?.[0] && (
                <div style={{ fontSize: 13, color: C.soft, marginTop: 8 }}>
                  {item.presenters[0].name}{item.presenters[0].title ? `, ${item.presenters[0].title}` : ''}
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 14, color: C.soft }}>The meeting is about to begin.</div>
          )}

          {upcoming.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: C.dim, letterSpacing: '0.14em', textTransform: 'uppercase', margin: '4px 0 8px' }}>Up next</div>
              {upcoming.slice(0, 6).map(u => (
                <div key={u.id} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: `1px solid ${C.line}` }}>
                  <span style={{ fontSize: 13, color: C.soft, fontWeight: 600, minWidth: 28 }}>{u.item_number}</span>
                  <span style={{ fontSize: 14, color: C.soft, lineHeight: 1.3 }}>{u.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '10px 20px', borderTop: `1px solid ${C.line}`, fontSize: 11, color: C.dim, letterSpacing: '0.06em' }}>
          Live on CSDtv
        </div>
      </aside>
    </div>
  )
}
