/** Rare check when listening is off — picks up admin / assign toggles without refreshing OBS. */
export const POLL_LISTEN_CHECK_MS = 120_000
/** Listening on, no meeting assigned yet — detect assignment. */
export const POLL_WAKE_MS = 120_000
/** Assigned channel, meeting not in prepared/live (e.g. draft only). */
export const POLL_IDLE_MS = 5_000
/** Pre-roll playlist channel while meeting is prepared or live. */
export const POLL_PREROLL_MS = 1_000
/** Overlay browser source during prepared or live (lower thirds, agenda, QR). */
export const POLL_LIVE_OVERLAY_MS = 350
/** Dais / second screen during prepared or live. */
export const POLL_LIVE_OTHER_MS = 500

/** Operator is actively driving outputs — use fast polls, not idle. */
export function isActiveBroadcastStatus(status: string | null | undefined): boolean {
  return status === 'live' || status === 'prepared'
}

export function resolveOutputPollIntervalMs(args: {
  obs_polling_enabled: boolean
  active: boolean
  view_type: string
  broadcast_status: string | null
}): number {
  if (!args.obs_polling_enabled) return POLL_LISTEN_CHECK_MS
  if (!args.active) return POLL_WAKE_MS
  const status = args.broadcast_status ?? 'none'
  if (isActiveBroadcastStatus(status)) {
    return args.view_type === 'overlay' ? POLL_LIVE_OVERLAY_MS : POLL_LIVE_OTHER_MS
  }
  if (args.view_type === 'preroll') return POLL_PREROLL_MS
  return POLL_IDLE_MS
}
