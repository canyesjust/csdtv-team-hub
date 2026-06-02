'use client'

import { useEffect, useRef, useState } from 'react'
import type { PublicChannelState } from '@/lib/board-meetings/public-output-state'
import { useBoardChannelState } from '@/app/board/hooks/useBoardChannelState'
import type { PublicPlaylistState } from '@/lib/board-meetings/playlist-types'
import { BoardBlankFullscreen } from '@/app/board/components/BoardBlankOutput'
import BoardIdleBranding from '@/app/board/components/BoardIdleBranding'
import {
  PrerollAgendaPreviewCard,
  PrerollBrandingStrip,
  PrerollCountdownCard,
  PrerollCustomCard,
  PrerollMeetTheBoardCard,
  PrerollPastMeetingsCard,
} from '@/app/board/components/PrerollInfoCards'

export default function BoardPrerollView({
  channelNumber,
  initialChannelName,
}: {
  channelNumber: number
  initialChannelName?: string
}) {
  const state = useBoardChannelState(channelNumber, { livePriority: true })
  const [fadeKey, setFadeKey] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const playlist = state?.state?.playlist
  const itemKey = playlist?.replace_now_asset?.started_at
    || playlist?.current_item?.id
    || 'idle'

  useEffect(() => {
    setFadeKey(k => k + 1)
  }, [itemKey])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !playlist?.music_bed_url) return

    const showingVideo =
      playlist.replace_now_asset?.asset_type === 'video' ||
      playlist.replace_now_asset?.asset_type === 'bumper' ||
      (playlist.current_item?.asset_type === 'video' || playlist.current_item?.asset_type === 'bumper')

    if (showingVideo) {
      audio.pause()
    } else if (playlist.playback_state === 'playing') {
      audio.play().catch(() => {})
    }
  }, [playlist])

  if (!state?.active) {
    const screenName = state?.channel_name || initialChannelName || `Channel ${channelNumber}`
    if (state?.show_channel_ident) {
      return <BoardIdleBranding screenName={screenName} variant="fullscreen" statusLine={null} />
    }
    return <BoardBlankFullscreen />
  }

  const meetingTitle = state.meeting?.title || 'Board Meeting'
  const channelName = state.channel_name || initialChannelName || `Channel ${channelNumber}`
  const ticker =
    state.agenda_preview_items.length > 0
      ? state.agenda_preview_items
      : [
          ...state.completed_items.map(c => ({ item_number: c.number, title: c.title })),
          ...(state.current_item
            ? [{ item_number: state.current_item.item_number, title: state.current_item.title }]
            : []),
          ...state.upcoming_items,
        ]

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
      {playlist?.music_bed_url && (
        <audio ref={audioRef} src={playlist.music_bed_url} loop preload="auto" />
      )}

      <PrerollBrandingStrip channelName={channelName} meetingTitle={meetingTitle} />

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', minHeight: 0 }}>
        <div key={fadeKey} style={{ width: '100%', animation: 'preroll-fade 0.5s ease' }}>
          <PrerollMainContent state={state} playlist={playlist} videoRef={videoRef} />
        </div>
      </div>

      {ticker.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: '14px 0', overflow: 'hidden', whiteSpace: 'nowrap', flexShrink: 0 }}>
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
        </div>
      )}

      <style>{`
        @keyframes board-ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-100%); } }
        @keyframes preroll-fade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
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
      return (
        <video
          ref={videoRef}
          key={replace.started_at}
          src={replace.asset_url}
          autoPlay
          muted
          playsInline
          style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '8px' }}
        />
      )
    }
    return (
      <img
        src={replace.asset_url}
        alt={replace.label}
        style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: '8px' }}
      />
    )
  }

  const item = playlist.current_item
  if (!item) {
    return <p style={{ textAlign: 'center', fontSize: '22px', color: '#c5d0e8' }}>Meeting begins shortly</p>
  }

  if (item.item_type === 'video' || item.item_type === 'bumper') {
    if (!item.asset_url) return <p style={{ textAlign: 'center' }}>Video unavailable</p>
    return (
      <video
        ref={videoRef}
        key={item.id}
        src={item.asset_url}
        autoPlay
        muted
        playsInline
        style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '8px' }}
      />
    )
  }

  if (item.item_type === 'image' && item.asset_url) {
    return (
      <img
        src={item.asset_url}
        alt={item.label}
        style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: '8px' }}
      />
    )
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

  return <p style={{ textAlign: 'center', fontSize: '20px' }}>{item.label}</p>
}
