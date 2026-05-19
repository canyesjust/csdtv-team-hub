import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getVoteResultRemainingSeconds,
  isVoteResultActive,
  listMotionsEnriched,
} from '@/lib/board-meetings/motion-control'
import { getCachedBoardMemberPeople } from '@/lib/board-meetings/control-meeting-cache'
import type { ControlBundle, MotionLifecycleState, ResultOverlayState } from '@/lib/board-meetings/types'
import type { EnrichedMotion } from '@/lib/board-meetings/motion-types'

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

const CLOSED_MOTION_STATUSES = new Set(['withdrawn', 'tabled', 'superseded', 'replaced'])

function isMotionDrafting(m: EnrichedMotion): boolean {
  return m.status === 'open_for_discussion' && (!m.moved_by_person_id || !m.seconded_by_person_id)
}

function isSubstituteInPlay(m: EnrichedMotion): boolean {
  return (
    m.motion_type === 'substitute' &&
    (isMotionDrafting(m) || m.status === 'open_for_discussion' || m.status === 'voting')
  )
}

function buildMotionLifecycle(
  state: Record<string, unknown> | null,
  motions: EnrichedMotion[],
): MotionLifecycleState {
  const openMotions = motions
    .filter(m => !CLOSED_MOTION_STATUSES.has(m.status))
    .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())

  const substitute = openMotions.find(isSubstituteInPlay)
  const activeRow = substitute ?? openMotions[0]

  if (!activeRow) {
    return { state: 'no_motion', active_motion: null, parent_motion: null, recorded_votes_count: 0 }
  }

  const overlayActive = !!state && isVoteResultActive(state as Parameters<typeof isVoteResultActive>[0])
  const parentRow = substitute?.parent_motion_id
    ? motions.find(m => m.id === substitute.parent_motion_id) ?? null
    : null

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
    active_motion: {
      id: activeRow.id,
      motion_type:
        activeRow.motion_type === 'substitute' || activeRow.motion_type === 'amendment'
          ? activeRow.motion_type
          : 'main',
      text: activeRow.motion_text,
      agenda_item_id: activeRow.agenda_item_id,
      mover_id: activeRow.moved_by_person_id,
      mover_name: activeRow.moved_by?.display_name ?? null,
      seconder_id: activeRow.seconded_by_person_id,
      seconder_name: activeRow.seconded_by?.display_name ?? null,
      vote_type: (activeRow.vote_mode || 'voice') as 'voice' | 'roll_call',
      status: activeRow.status,
      parent_motion_id: activeRow.parent_motion_id,
      created_at: activeRow.opened_at,
    },
    parent_motion: parentRow
      ? {
          id: parentRow.id,
          motion_type:
            parentRow.motion_type === 'substitute' || parentRow.motion_type === 'amendment'
              ? parentRow.motion_type
              : 'main',
          text: parentRow.motion_text,
          agenda_item_id: parentRow.agenda_item_id,
          mover_id: parentRow.moved_by_person_id,
          mover_name: parentRow.moved_by?.display_name ?? null,
          seconder_id: parentRow.seconded_by_person_id,
          seconder_name: parentRow.seconded_by?.display_name ?? null,
          vote_type: (parentRow.vote_mode || 'voice') as 'voice' | 'roll_call',
          status: parentRow.status,
          parent_motion_id: parentRow.parent_motion_id,
          created_at: parentRow.opened_at,
        }
      : null,
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

function lowerThirdFromPeople(
  personId: string | null | undefined,
  people: Awaited<ReturnType<typeof getCachedBoardMemberPeople>>,
) {
  if (!personId) return null
  const person = people.find(p => p.id === personId)
  if (!person) return null
  return {
    person_id: person.id,
    display_name: person.display_name,
    primary_title: person.primary_title,
    affiliation: person.affiliation,
    officer_position: person.officer_position,
    photo_url: null,
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
    people,
  ] = await Promise.all([
    service.from('meeting_broadcast_state').select('*').eq('board_meeting_id', boardMeetingId).maybeSingle(),
    service
      .from('channel_assignments')
      .select('output_channel_id')
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
    getCachedBoardMemberPeople(service),
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
  const lowerThirdActive = lowerThirdFromPeople(state?.active_lower_third_person_id, people)

  const broadcast_state = {
    ...(state || {}),
    status: bm.broadcast_status,
    mode: state?.mode ?? 'normal',
    live_started_at: liveEvent?.occurred_at ?? bm.scheduled_public_start ?? null,
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
    })),
  }
}
