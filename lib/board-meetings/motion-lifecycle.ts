import {
  getVoteResultRemainingSeconds,
  isVoteResultActive,
} from '@/lib/board-meetings/motion-control'
import { isMotionDrafting, pickActiveMotions } from '@/lib/board-meetings/motion-active-pick'
import type { MotionLifecycleState, ResultOverlayState } from '@/lib/board-meetings/types'
import type { EnrichedMotion } from '@/lib/board-meetings/motion-types'

/**
 * Motion lifecycle + result-overlay derivation shared by the full control
 * bundle (control-bundle.ts) and the realtime fast path (control-live-bundle.ts).
 * Pure functions of broadcast state + enriched motions — no I/O.
 */

function mapLifecycleState(
  motion: EnrichedMotion,
  broadcastState: Record<string, unknown> | null,
  overlayActive: boolean,
): MotionLifecycleState['state'] {
  const resultMotionId = broadcastState?.active_vote_result_motion_id as string | undefined
  if (overlayActive && resultMotionId === motion.id) return 'pushed'
  if (motion.status === 'voting') return 'voting'
  if (motion.status === 'passed' || motion.status === 'failed') return 'voted'
  if (isMotionDrafting(motion)) return 'drafting'
  if (motion.status === 'open_for_discussion') return 'open_for_discussion'
  return 'closed'
}

export function buildMotionLifecycle(
  state: Record<string, unknown> | null,
  motions: EnrichedMotion[],
): MotionLifecycleState {
  const { active, parent, activeRow } = pickActiveMotions(
    motions,
    (state?.active_motion_id as string | null | undefined) ?? null,
    (state?.current_agenda_item_id as string | null | undefined) ?? null,
  )

  if (!activeRow || !active) {
    return { state: 'no_motion', active_motion: null, parent_motion: null, recorded_votes_count: 0 }
  }

  const overlayActive = !!state && isVoteResultActive(state as Parameters<typeof isVoteResultActive>[0])

  return {
    state: mapLifecycleState(activeRow, state, overlayActive),
    active_motion: active,
    parent_motion: parent,
    recorded_votes_count: activeRow.votes?.length ?? 0,
  }
}

export function buildResultOverlay(
  state: Record<string, unknown> | null,
  motions: EnrichedMotion[],
): ResultOverlayState | null {
  if (!state || !isVoteResultActive(state as Parameters<typeof isVoteResultActive>[0])) {
    return null
  }

  const motionId = state.active_vote_result_motion_id as string
  const motion = motions.find(m => m.id === motionId)
  if (!motion) return null

  const remaining = getVoteResultRemainingSeconds(state as Parameters<typeof getVoteResultRemainingSeconds>[0])
  const total = (state.vote_result_duration_seconds as number) ?? 8
  const startedAt = (state.vote_result_started_at as string) || new Date().toISOString()

  return {
    active: true,
    motion_id: motionId,
    passed: motion.result === 'passed',
    yea_count: motion.tally.yea ?? 0,
    nay_count: motion.tally.nay ?? 0,
    abstain_count: motion.tally.abstain ?? 0,
    started_at: startedAt,
    total_duration: total,
    seconds_remaining: remaining,
    held: !!(state.vote_result_held),
  }
}
