/**
 * Polling ladder, lifted from the board-meeting outputs which already solved
 * this. An OBS browser source left open in an empty trailer for three weeks
 * must not hit the API every 350ms.
 */
export const GFX_POLL_LISTEN_OFF_MS = 120_000
export const GFX_POLL_WAKE_MS = 120_000
export const GFX_POLL_IDLE_MS = 5_000
export const GFX_POLL_LIVE_MS = 350
export const GFX_POLL_REALTIME_FALLBACK_MS = 1_500

export function resolveGfxPollMs(args: {
  listening: boolean
  hasShow: boolean
  live: boolean
  realtimeConnected: boolean
}): number {
  if (!args.listening) return GFX_POLL_LISTEN_OFF_MS
  if (!args.hasShow) return GFX_POLL_WAKE_MS
  if (!args.live) return GFX_POLL_IDLE_MS
  return args.realtimeConnected ? GFX_POLL_REALTIME_FALLBACK_MS : GFX_POLL_LIVE_MS
}
