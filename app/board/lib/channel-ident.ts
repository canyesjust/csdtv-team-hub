import type { PublicChannelState } from '@/lib/board-meetings/public-output-state'

/** True when operator has enabled the channel ID card and no higher-priority overlay content is active. */
export function overlayShouldShowChannelIdent(state: PublicChannelState): boolean {
  if (!state.active || !state.show_channel_ident) return false
  const b = state.state
  if (!b || b.overlay_visible === false || b.mode !== 'normal') return false
  if (state.agenda_branding_hold || b.agenda_branding_hold) return false

  const voteResult = b.active_vote_result
  const showVoteResult =
    !!voteResult &&
    (!!voteResult.held || !!state.result_overlay?.held || (voteResult.remaining_seconds ?? 0) > 0)
  if (showVoteResult || b.active_motion) return false

  const item = state.current_item
  const showItem = b.overlay_visible && item
  const timer = state.timer
  const showTimer = timer?.show_on_broadcast && (timer.remaining_seconds ?? 0) > 0
  if (showItem || showTimer || b.active_qr || b.active_lower_third) return false

  return true
}
