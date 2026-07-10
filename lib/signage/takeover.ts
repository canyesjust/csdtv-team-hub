import type { ScreenTarget, TargetableRow } from './targeting'
import type { ScreenFeed } from './screen-feed'
import { signageLiveMatchesScreen } from './live-targeting'
import { normalizeSignageStreamUrl } from './stream-url'

// A takeover is only honored while its heartbeat is fresh. The control surface
// pings the heartbeat while it's open; if the operator forgets to turn the
// takeover off, the heartbeat goes stale and screens return to normal on their
// own (instead of staying stuck on the pre-roll all day).
export const TAKEOVER_STALE_MS = 10 * 60 * 1000

// Minimal shape of a signage_live row for takeover resolution. It extends the
// targeting fields so signageLiveMatchesScreen can scope it to a screen.
type LiveRow = TargetableRow & {
  is_live: boolean | null
  hls_url: string | null
  label: string | null
}

type LiveScreen = {
  accepts_takeover: boolean | null
}

/**
 * Resolve the live (HLS/CSDtv) takeover for a screen. Behaviour-identical
 * extraction of the inline logic from buildScreenFeed: a screen goes live only
 * when the feed is live, has a stream URL, the screen opted in
 * (accepts_takeover), and the live row targets this screen.
 */
export function resolveScreenLive(
  liveRow: LiveRow | null | undefined,
  screen: LiveScreen,
  target: ScreenTarget,
): ScreenFeed['live'] {
  const streamUrl = normalizeSignageStreamUrl(liveRow?.hls_url)
  if (
    liveRow?.is_live &&
    streamUrl &&
    screen.accepts_takeover &&
    signageLiveMatchesScreen(liveRow, target)
  ) {
    return { live: true, hls_url: streamUrl, label: liveRow.label }
  }
  return { live: false }
}

// Minimal shape of a signage_board_takeover row for takeover resolution.
type BoardTakeoverRow = {
  active: boolean | null
  heartbeat_at: string | null
  mode: string | null
  board_channel_number: number | null
  youtube_url: string | null
  label: string | null
}

type BoardScreen = {
  board_takeover_enabled: boolean | null
  board_takeover_audio: boolean | null
}

/**
 * Resolve the board-meeting takeover for a screen. Behaviour-identical
 * extraction of the inline logic from buildScreenFeed: honored only while the
 * takeover is active, its heartbeat is fresh, and the screen opted in.
 */
export function resolveBoardTakeover(
  tk: BoardTakeoverRow | null | undefined,
  screen: BoardScreen,
  now: number = Date.now(),
): ScreenFeed['board_takeover'] {
  const takeoverFresh =
    !!tk?.heartbeat_at && now - new Date(tk.heartbeat_at).getTime() < TAKEOVER_STALE_MS
  if (tk?.active && takeoverFresh && screen.board_takeover_enabled) {
    const audio = !!screen.board_takeover_audio
    if (tk.mode === 'preroll' && tk.board_channel_number) {
      return { mode: 'preroll', url: `/board/${tk.board_channel_number}/preroll`, audio, label: tk.label ?? null }
    }
    if (tk.mode === 'live' && tk.youtube_url && tk.board_channel_number) {
      // Stream + live agenda sidebar (the page reads the YouTube URL from board state).
      return { mode: 'live', url: `/board/${tk.board_channel_number}/stream?audio=${audio ? 1 : 0}`, audio, label: tk.label ?? null }
    }
  }
  return undefined
}
