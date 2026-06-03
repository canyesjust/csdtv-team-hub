import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getVoteResultRemainingSeconds,
  isVoteResultActive,
  listMotionsEnriched,
} from '@/lib/board-meetings/motion-control'
import {
  buildPublicLowerThirdPayload,
  normalizeLowerThirdPosition,
} from '@/lib/board-meetings/lower-third-control'
import type { ControlBundle, MotionLifecycleState, ResultOverlayState } from '@/lib/board-meetings/types'
import type { EnrichedMotion } from '@/lib/board-meetings/motion-types'
import { isMotionDrafting, pickActiveMotions } from '@/lib/board-meetings/motion-active-pick'

const LIVE_EVENT_TYPES = ['meeting_went_live', 'go_live']

/** Fields that change during a live meeting — omit agenda, people directory, utilities. */
export type ControlLivePatch = Pick<
  ControlBundle,
  | 'broadcast_state'
  | 'motion_lifecycle'
  | 'result_overlay'
  | 'lower_third_active'
  | 'active_lower_third'
  | 'active_timer'
  | 'playlist_state'
  | 'current_documents'
  | 'channel_assignments'
>

function buildMotionLifecycle(
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

  const mapState = (): MotionLifecycleState['state'] => {
    const resultMotionId = state?.active_vote_result_motion_id as string | undefined
    if (overlayActive && resultMotionId === activeRow.id) return 'pushed'
    if (activeRow.status === 'voting') return 'voting'
    if (activeRow.status === 'passed' || activeRow.status === 'failed') return 'voted'
    if (isMotionDrafting(activeRow)) return 'drafting'
    if (activeRow.status === 'open_for_discussion') return 'open_for_discussion'
    return 'closed'
  }

  return {
    state: mapState(),
    active_motion: active,
    parent_motion: parent,
    recorded_votes_count: activeRow.votes?.length ?? 0,
  }
}

function buildResultOverlay(
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

/**
 * Fast path for realtime / background sync — skips agenda, utilities, signed photo URLs.
 */
export async function buildControlLiveBundle(
  service: SupabaseClient,
  boardMeetingId: string,
  bm: { broadcast_status: string; scheduled_public_start: string | null },
): Promise<ControlLivePatch> {
  const [
    { data: state },
    { data: assignments },
    { data: timers },
    { data: liveEvents },
    { data: playlist },
    motions,
  ] = await Promise.all([
    service.from('meeting_broadcast_state').select('*').eq('board_meeting_id', boardMeetingId).maybeSingle(),
    service
      .from('channel_assignments')
      .select('output_channel_id, show_channel_ident')
      .eq('board_meeting_id', boardMeetingId)
      .is('unassigned_at', null),
    service
      .from('meeting_timers')
      .select('*')
      .eq('board_meeting_id', boardMeetingId)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1),
    service
      .from('meeting_event_log')
      .select('occurred_at')
      .eq('board_meeting_id', boardMeetingId)
      .in('event_type', LIVE_EVENT_TYPES)
      .order('occurred_at', { ascending: false })
      .limit(1),
    service
      .from('meeting_playlists')
      .select('playback_state, held_item_id, current_item_id')
      .eq('board_meeting_id', boardMeetingId)
      .maybeSingle(),
    listMotionsEnriched(service, boardMeetingId, { openOnly: true, voteCountsOnly: true }),
  ])

  const current_documents = state?.current_agenda_item_id
    ? (
        await service
          .from('board_meeting_agenda_documents')
          .select('title, source_url')
          .eq('agenda_item_id', state.current_agenda_item_id)
          .order('sort_order')
      ).data || []
    : []

  const liveEvent = liveEvents?.[0]
  const modeEndsAt =
    state?.mode_started_at && state.mode_duration_seconds
      ? new Date(new Date(state.mode_started_at).getTime() + state.mode_duration_seconds * 1000).toISOString()
      : null

  const motion_lifecycle = buildMotionLifecycle(state, motions)
  const result_overlay = buildResultOverlay(state, motions)
  const lowerThirdActive = await buildPublicLowerThirdPayload(service, state?.active_lower_third_person_id)

  const broadcast_state = {
    ...(state || {}),
    status: bm.broadcast_status,
    mode: state?.mode ?? 'normal',
    live_started_at: liveEvent?.occurred_at ?? bm.scheduled_public_start ?? null,
    elapsed_started_at: (state?.elapsed_started_at as string | null | undefined) ?? null,
    current_agenda_item_id: state?.current_agenda_item_id ?? null,
    agenda_overlay_visible: state?.overlay_visible ?? true,
    overlay_visible: state?.overlay_visible ?? true,
    active_qr_url: state?.active_qr_url ?? null,
    active_qr_label: state?.active_qr_label ?? null,
    active_qr_started_at: state?.active_qr_started_at ?? null,
    active_qr_duration_seconds: state?.active_qr_duration_seconds ?? null,
    mode_ends_at: modeEndsAt,
    active_motion_id: state?.active_motion_id ?? null,
    active_vote_result_motion_id: state?.active_vote_result_motion_id ?? null,
    vote_result_started_at: state?.vote_result_started_at ?? null,
    vote_result_duration_seconds: state?.vote_result_duration_seconds ?? null,
    active_lower_third_person_id: state?.active_lower_third_person_id ?? null,
    lower_third_position: normalizeLowerThirdPosition(state?.lower_third_position),
    agenda_branding_hold: !!state?.agenda_branding_hold,
  }

  return {
    broadcast_state,
    motion_lifecycle,
    result_overlay,
    lower_third_active: lowerThirdActive,
    active_lower_third: lowerThirdActive,
    active_timer: timers?.[0] ?? null,
    playlist_state: playlist
      ? {
          playback_state: playlist.playback_state,
          held_item_id: playlist.held_item_id,
          current_item_id: playlist.current_item_id,
        }
      : null,
    current_documents,
    channel_assignments: (assignments || []).map(a => ({
      output_channel_id: a.output_channel_id,
      show_channel_ident: !!a.show_channel_ident,
    })),
  }
}
