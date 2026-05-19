import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getVoteResultRemainingSeconds,
  isVoteResultActive,
  listMotionsEnriched,
} from '@/lib/board-meetings/motion-control'
import { buildPublicLowerThirdPayload } from '@/lib/board-meetings/lower-third-control'
import { loadAttendance } from '@/lib/board-meetings/attendance-control'
import { loadMeetingPlaylistBundle } from '@/lib/board-meetings/playlist-playback'
import { mediaPublicUrl } from '@/lib/board-meetings/media-library'
import type {
  ActiveMotion,
  ControlBundle,
  MotionLifecycleState,
  ResultOverlayState,
} from '@/lib/board-meetings/types'
import type { EnrichedMotion } from '@/lib/board-meetings/motion-types'

const LIVE_EVENT_TYPES = ['meeting_went_live', 'go_live']

export async function buildControlSurfaceBundle(
  service: SupabaseClient,
  productionId: string,
): Promise<ControlBundle | null> {
  const { data: bm } = await service.from('board_meetings').select('*').eq('production_id', productionId).maybeSingle()
  if (!bm) return null

  const [
    { data: items },
    { data: state },
    { data: assignments },
    { data: timers },
    { data: events },
    { data: channels },
    { data: templates },
    { data: liveEvents },
    { data: people },
  ] = await Promise.all([
    service
      .from('board_meeting_agenda_items')
      .select('id, section_number, section_title, item_number, sort_order, title, type, is_broadcastable, action_requested, consent_block')
      .eq('board_meeting_id', bm.id)
      .order('sort_order', { ascending: true }),
    service.from('meeting_broadcast_state').select('*').eq('board_meeting_id', bm.id).maybeSingle(),
    service
      .from('channel_assignments')
      .select('id, output_channel_id, assigned_at, unassigned_at')
      .eq('board_meeting_id', bm.id)
      .is('unassigned_at', null),
    service
      .from('meeting_timers')
      .select('*')
      .eq('board_meeting_id', bm.id)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1),
    service
      .from('meeting_event_log')
      .select('id, event_type, event_data, occurred_at')
      .eq('board_meeting_id', bm.id)
      .order('occurred_at', { ascending: false })
      .limit(50),
    service.from('output_channels').select('id, channel_number, channel_name, view_type, tier').eq('is_active', true).order('channel_number'),
    service.from('timer_templates').select('*').order('sort_order', { ascending: true }),
    service
      .from('meeting_event_log')
      .select('occurred_at')
      .eq('board_meeting_id', bm.id)
      .in('event_type', LIVE_EVENT_TYPES)
      .order('occurred_at', { ascending: false })
      .limit(1),
    service
      .from('lower_third_people')
      .select(
        'id, display_name, primary_title, affiliation, photo_path, alternate_titles, category, officer_position, is_active',
      )
      .eq('is_active', true)
      .eq('category', 'board_member')
      .order('display_name'),
  ])

  const { data: prod } = await service
    .from('productions')
    .select('production_number, livestream_url, title')
    .eq('id', productionId)
    .maybeSingle()

  const attendance = await loadAttendance(service, bm.id)
  const motions = await listMotionsEnriched(service, bm.id)
  const lowerThirdActive = await buildPublicLowerThirdPayload(service, state?.active_lower_third_person_id)

  const playlistBundle = await loadMeetingPlaylistBundle(service, bm.id)
  const playlist_state = playlistBundle
    ? {
        playback_state: playlistBundle.playlist.playback_state,
        held_item_id: playlistBundle.playlist.held_item_id,
        current_item_id: playlistBundle.playlist.current_item_id,
      }
    : null

  const liveEvent = liveEvents?.[0]
  const modeEndsAt =
    state?.mode_started_at && state.mode_duration_seconds
      ? new Date(new Date(state.mode_started_at).getTime() + state.mode_duration_seconds * 1000).toISOString()
      : null

  const motion_lifecycle = buildMotionLifecycle(state, motions)
  const result_overlay = buildResultOverlay(state, motions)

  let current_documents: { source_url: string | null; title: string }[] = []
  if (state?.current_agenda_item_id) {
    const { data: docs } = await service
      .from('board_meeting_agenda_documents')
      .select('title, source_url')
      .eq('agenda_item_id', state.current_agenda_item_id)
      .order('sort_order')
    current_documents = docs || []
  }

  const agenda_items = (items || []).filter(i => i.is_broadcastable)
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
    meeting: {
      title: prod?.title || 'Board Meeting',
      production_number: prod?.production_number ?? null,
      quorum_size: attendance.quorum.threshold,
    },
    broadcast_state,
    agenda_items,
    items: agenda_items,
    motion_lifecycle,
    attendance: {
      records: attendance.records,
      quorum: attendance.quorum,
    },
    lower_third_active: lowerThirdActive,
    lower_third_people: people || [],
    result_overlay,
    playlist_state,
    channel_assignments: (assignments || []).map(a => ({
      output_channel_id: a.output_channel_id,
    })),
    channels: channels || [],
    output_channels: channels || [],
    active_timer: timers?.[0] ?? null,
    recent_events: (events || []).map(e => ({
      event_type: e.event_type,
      created_at: e.occurred_at,
      occurred_at: e.occurred_at,
    })),
    timer_templates: templates || [],
    meeting_playlist: playlistBundle
      ? {
          playlist: playlistBundle.playlist,
          items: playlistBundle.items.map(it => {
            const asset = it.media_asset_id ? playlistBundle.assets.get(it.media_asset_id) : null
            return { ...it, asset_url: asset ? mediaPublicUrl(service, asset.storage_path) : null }
          }),
        }
      : null,
    board_meeting: bm,
    production: prod,
    active_lower_third: lowerThirdActive,
    current_documents,
  }
}

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

function toActiveMotion(m: EnrichedMotion): ActiveMotion {
  const motionType: ActiveMotion['motion_type'] =
    m.motion_type === 'substitute' || m.motion_type === 'amendment' ? m.motion_type : 'main'
  return {
    id: m.id,
    motion_type: motionType,
    text: m.motion_text,
    agenda_item_id: m.agenda_item_id,
    mover_id: m.moved_by_person_id,
    mover_name: m.moved_by?.display_name ?? null,
    seconder_id: m.seconded_by_person_id,
    seconder_name: m.seconded_by?.display_name ?? null,
    vote_type: (m.vote_mode || 'voice') as 'voice' | 'roll_call',
    status: m.status,
    parent_motion_id: m.parent_motion_id,
    created_at: m.opened_at,
  }
}

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

function buildMotionLifecycle(
  state: Record<string, unknown> | null,
  motions: Awaited<ReturnType<typeof listMotionsEnriched>>,
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

  return {
    state: mapLifecycleState(activeRow, state, overlayActive),
    active_motion: toActiveMotion(activeRow),
    parent_motion: parentRow ? toActiveMotion(parentRow) : null,
    recorded_votes_count: activeRow.votes?.length ?? 0,
  }
}

function buildResultOverlay(
  state: Record<string, unknown> | null,
  motions: Awaited<ReturnType<typeof listMotionsEnriched>>,
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
