'use client'

import { useEffect, useRef, useState } from 'react'
import type { PublicChannelState } from '@/lib/board-meetings/public-output-state'
import { useBoardChannelState } from '@/app/board/hooks/useBoardChannelState'
import type { PublicPlaylistState } from '@/lib/board-meetings/playlist-types'
import type { NewsHeadline } from '@/lib/board-meetings/news-ticker'
import { BoardBlankFullscreen } from '@/app/board/components/BoardBlankOutput'
import BoardIdleBranding from '@/app/board/components/BoardIdleBranding'
import {
  PrerollAgendaPreviewCard,
  PrerollCountdownCard,
  PrerollCustomCard,
  PrerollMeetTheBoardCard,
  PrerollPastMeetingsCard,
} from '@/app/board/components/PrerollInfoCards'

const LOGO_URL =
  'https://www.canyonsdistrict.org/wp-content/uploads/elementor/thumbs/canyons-district-color-op6mkcg4koujoevgv1jfwozusko98ctvk4hj5k84cg.png'

const NAVY = '#0b1730'
const PANEL = '#12203c'
const MEDIA_BG = '#0e1c38'
const ACCENT = '#e8b04b'
const TEXT = '#eaf0fb'
const MUTED = '#aebfdc'
const FAINT = '#9fb0cf'
const HAIR = 'rgba(255,255,255,0.08)'

function formatMeetingWhen(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return ''
  const date = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${date} · ${time}`
}

function useClock(): string {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(id)
  }, [])
  return now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function useDistrictNews(): NewsHeadline[] {
  const [headlines, setHeadlines] = useState<NewsHeadline[]>([])
  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetch('/api/board-meetings/news-ticker')
        .then(r => r.json())
        .then(d => { if (!cancelled) setHeadlines(Array.isArray(d?.headlines) ? d.headlines : []) })
        .catch(() => {})
    load()
    const id = setInterval(load, 600000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])
  return headlines
}

export default function BoardPrerollView({
  channelNumber,
  initialChannelName,
}: {
  channelNumber: number
  initialChannelName?: string
}) {
  const { state } = useBoardChannelState(channelNumber, { livePriority: true })
  const [fadeKey, setFadeKey] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const clock = useClock()
  const news = useDistrictNews()

  const playlist = state?.state?.playlist
  const itemKey = playlist?.replace_now_asset?.started_at || playlist?.current_item?.id || 'idle'

  useEffect(() => { setFadeKey(k => k + 1) }, [itemKey])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !playlist?.music_bed_url) return
    const showingVideo =
      playlist.replace_now_asset?.asset_type === 'video' ||
      playlist.replace_now_asset?.asset_type === 'bumper' ||
      playlist.current_item?.asset_type === 'video' ||
      playlist.current_item?.asset_type === 'bumper'
    if (showingVideo) audio.pause()
    else if (playlist.playback_state === 'playing') audio.play().catch(() => {})
  }, [playlist])

  if (!state?.active) {
    const screenName = state?.channel_name || initialChannelName || `Channel ${channelNumber}`
    if (state?.show_channel_ident) {
      return <BoardIdleBranding screenName={screenName} variant="fullscreen" statusLine={null} />
    }
    return <BoardBlankFullscreen />
  }

  const meetingTitle = state.meeting?.title || 'Board Meeting'
  const whenText = formatMeetingWhen(state.meeting?.scheduled_public_start ?? state.meeting?.date)
  const agenda =
    state.agenda_preview_items.length > 0
      ? state.agenda_preview_items.map(a => ({ key: a.id, number: a.item_number, title: a.title }))
      : [
          ...state.completed_items.map(c => ({ key: c.id, number: c.number, title: c.title })),
          ...(state.current_item
            ? [{ key: state.current_item.id, number: state.current_item.item_number, title: state.current_item.title }]
            : []),
          ...state.upcoming_items.map(u => ({ key: u.id, number: u.item_number, title: u.title })),
        ]

  // Forward-compatible: a media item marked full-screen (Phase B will set this) hides
  // the panels and lets the clip fill the screen.
  const cfg = playlist?.current_item?.info_card_config as { full_screen?: boolean } | null | undefined
  const fullScreen = Boolean(cfg?.full_screen)

  const media = <PrerollMainContent state={state} playlist={playlist} videoRef={videoRef} />
  const musicBed = playlist?.music_bed_url ? (
    <audio ref={audioRef} src={playlist.music_bed_url} loop preload="auto" />
  ) : null

  const keyframes = (
    <style>{`
      @keyframes pr-fade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes pr-ag { 0%,7% { transform: translateY(0); } 93%,100% { transform: translateY(-50%); } }
      @keyframes pr-tk { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    `}</style>
  )

  if (fullScreen) {
    return (
      <div style={{ minHeight: '100vh', background: NAVY, color: TEXT, fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {musicBed}
        <div key={fadeKey} style={{ width: '100%', height: '100vh', animation: 'pr-fade 0.5s ease' }}>{media}</div>
        {keyframes}
      </div>
    )
  }

  const tickerHeadlines = news.length > 0 ? news.map(n => n.title) : agenda.map(a => `${a.number} ${a.title}`)

  return (
    <div style={{ minHeight: '100vh', height: '100vh', background: NAVY, color: TEXT, fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {musicBed}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.2vh 2vw', borderBottom: `1px solid ${HAIR}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.4vw' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_URL} alt="Canyons District" style={{ height: '4.4vh', width: 'auto', objectFit: 'contain' }} />
          <span style={{ fontSize: '2vh', letterSpacing: '0.03em', color: '#dce6f7' }}>Canyons District · Board of Education</span>
        </div>
        <span style={{ fontSize: '2vh', color: FAINT }}>{clock}</span>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: '1.2vw', padding: '1.4vh 1.2vw', minHeight: 0 }}>
        <div style={{ flex: 2.3, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
          <div key={fadeKey} style={{ width: '100%', aspectRatio: '16 / 9', maxHeight: '100%', background: MEDIA_BG, borderRadius: '0.8vh', border: `1px solid ${HAIR}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'pr-fade 0.5s ease' }}>
            {media}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.4vh', minWidth: 0 }}>
          <div style={{ background: PANEL, border: `1px solid ${HAIR}`, borderRadius: '0.8vh', padding: '1.6vh 1.4vw', flexShrink: 0 }}>
            <div style={{ fontSize: '1.5vh', letterSpacing: '0.06em', color: ACCENT, textTransform: 'uppercase' }}>Meeting starts soon</div>
            <div style={{ fontSize: '2.6vh', fontWeight: 600, margin: '0.8vh 0 0', lineHeight: 1.2 }}>{meetingTitle}</div>
            {whenText && <div style={{ fontSize: '1.7vh', color: MUTED, marginTop: '0.7vh' }}>{whenText}</div>}
          </div>

          <div style={{ background: PANEL, border: `1px solid ${HAIR}`, borderRadius: '0.8vh', padding: '1.6vh 1.4vw 0', display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            <div style={{ fontSize: '1.5vh', letterSpacing: '0.06em', color: ACCENT, textTransform: 'uppercase', marginBottom: '0.6vh', flexShrink: 0 }}>Upcoming agenda</div>
            {agenda.length === 0 ? (
              <div style={{ fontSize: '1.7vh', color: FAINT, padding: '1vh 0' }}>Agenda coming soon</div>
            ) : (
              <div style={{ overflow: 'hidden', flex: 1, minHeight: 0, position: 'relative' }}>
                <div style={{ animation: agenda.length > 6 ? 'pr-ag 26s ease-in-out infinite' : undefined }}>
                  {[...agenda, ...agenda].map((a, i) => (
                    <div key={`${a.key}-${i}`} style={{ display: 'flex', gap: '0.8vw', alignItems: 'baseline', padding: '0.9vh 0', borderTop: i === 0 ? 'none' : `1px solid rgba(255,255,255,0.06)` }}>
                      <span style={{ fontSize: '1.5vh', color: ACCENT, minWidth: '2.4vw' }}>{a.number}</span>
                      <span style={{ fontSize: '1.7vh', color: '#dce6f7' }}>{a.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ flexShrink: 0, borderTop: `1px solid ${HAIR}`, padding: '1.1vh 2vw', overflow: 'hidden', whiteSpace: 'nowrap' }}>
        <span style={{ display: 'inline-block', animation: 'pr-tk 40s linear infinite', fontSize: '1.6vh', color: FAINT }}>
          {[0, 1].map(rep => (
            <span key={rep}>
              <span style={{ color: ACCENT, fontWeight: 600 }}>District news</span>
              {tickerHeadlines.map((h, i) => (
                <span key={`${rep}-${i}`} style={{ margin: '0 1.6vw' }}>·&nbsp;&nbsp;{h}</span>
              ))}
              <span style={{ marginRight: '2vw' }} />
            </span>
          ))}
        </span>
      </div>

      {keyframes}
    </div>
  )
}

function PrerollMainContent({
  state,
  playlist,
  videoRef,
}: {
  state: PublicChannelState
  playlist: PublicPlaylistState | null | undefined
  videoRef: React.RefObject<HTMLVideoElement | null>
}) {
  const mediaStyle: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'contain' }

  if (!playlist || playlist.playback_state === 'idle' || (!playlist.current_item && !playlist.replace_now_asset)) {
    if (state.show_channel_ident) {
      const screenName = state.channel_name || `Channel ${state.channel_number}`
      return <BoardIdleBranding screenName={screenName} variant="fullscreen" statusLine={null} />
    }
    return <BoardBlankFullscreen />
  }

  const replace = playlist.replace_now_asset
  if (replace) {
    if (replace.asset_type === 'video' || replace.asset_type === 'bumper') {
      return <video ref={videoRef} key={replace.started_at} src={replace.asset_url} autoPlay muted playsInline style={mediaStyle} />
    }
    return <img src={replace.asset_url} alt={replace.label} style={mediaStyle} />
  }

  const item = playlist.current_item
  if (!item) {
    return <p style={{ textAlign: 'center', fontSize: '2.4vh', color: '#c5d0e8' }}>Meeting begins shortly</p>
  }

  if (item.item_type === 'video' || item.item_type === 'bumper') {
    if (!item.asset_url) return <p style={{ textAlign: 'center' }}>Video unavailable</p>
    return <video ref={videoRef} key={item.id} src={item.asset_url} autoPlay muted playsInline style={mediaStyle} />
  }
  if (item.item_type === 'image' && item.asset_url) {
    return <img src={item.asset_url} alt={item.label} style={mediaStyle} />
  }
  if (item.item_type === 'info_card_countdown') {
    return <PrerollCountdownCard scheduledStart={state.meeting?.scheduled_public_start ?? null} />
  }
  if (item.item_type === 'info_card_agenda_preview') {
    return <PrerollAgendaPreviewCard state={state} />
  }
  if (item.item_type === 'info_card_meet_the_board') {
    const rotate = typeof item.info_card_config?.rotate_seconds === 'number' ? item.info_card_config.rotate_seconds : 8
    return <PrerollMeetTheBoardCard rotateSeconds={rotate} />
  }
  if (item.item_type === 'info_card_past_meetings') {
    return <PrerollPastMeetingsCard productionNumber={state.meeting?.production_number ?? null} />
  }
  if (item.item_type === 'info_card_custom') {
    return <PrerollCustomCard config={item.info_card_config} />
  }
  return <p style={{ textAlign: 'center', fontSize: '2.2vh' }}>{item.label}</p>
}
