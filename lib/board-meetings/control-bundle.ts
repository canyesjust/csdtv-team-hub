import type { SupabaseClient } from '@supabase/supabase-js'
import { listMotionsEnriched } from '@/lib/board-meetings/motion-control'
import { buildMotionLifecycle, buildResultOverlay } from '@/lib/board-meetings/motion-lifecycle'
import { buildPublicLowerThirdPayload, normalizeLowerThirdPosition } from '@/lib/board-meetings/lower-third-control'
import { loadAttendance } from '@/lib/board-meetings/attendance-control'
import { loadMeetingPlaylistBundle } from '@/lib/board-meetings/playlist-playback'
import { mediaPublicUrl } from '@/lib/board-meetings/media-library'
import { getCachedOutputChannels, getCachedTimerTemplates } from '@/lib/board-meetings/control-static-cache'
import {
  getCachedBoardMemberPeople,
  resolveAgendaNavigation,
} from '@/lib/board-meetings/control-meeting-cache'
import { loadControlUtilities } from '@/lib/board-meetings/control-utilities'
import type {
  ControlBundle,
  LowerThirdPerson,
} from '@/lib/board-meetings/types'
import type { EnrichedMotion } from '@/lib/board-meetings/motion-types'

const LIVE_EVENT_TYPES = ['meeting_went_live', 'go_live']

const AGENDA_PERSON_SELECT =
  'id, display_name, primary_title, affiliation, photo_path, alternate_titles, category, officer_position, is_active, group_label'

/** People named in this meeting's agenda (resolved presenters), for quick picks. */
async function loadAgendaPeople(
  service: SupabaseClient,
  boardMeetingId: string,
  cachedPeople: LowerThirdPerson[],
): Promise<LowerThirdPerson[]> {
  const { data: pres } = await service
    .from('board_meeting_presenters')
    .select('person_id, sort_order, board_meeting_agenda_items!inner(board_meeting_id)')
    .eq('board_meeting_agenda_items.board_meeting_id', boardMeetingId)
    .not('person_id', 'is', null)
    .order('sort_order', { ascending: true })

  const ids: string[] = []
  for (const p of pres || []) {
    const id = (p as { person_id: string | null }).person_id
    if (id && !ids.includes(id)) ids.push(id)
  }
  if (ids.length === 0) return []

  const byId = new Map(cachedPeople.map(p => [p.id, p]))
  const missing = ids.filter(id => !byId.has(id))
  if (missing.length > 0) {
    const { data } = await service
      .from('lower_third_people')
      .select(AGENDA_PERSON_SELECT)
      .in('id', missing)
      .eq('is_active', true)
    for (const p of (data || []) as LowerThirdPerson[]) byId.set(p.id, p)
  }
  return ids.map(id => byId.get(id)).filter((p): p is LowerThirdPerson => !!p)
}

export type BuildControlBundleOptions = {
  /** Faster path: skip full playlist items and defer heavy utilities payload. */
  slim?: boolean
}

export type ControlBundleBuild = {
  bundle: ControlBundle
  motions: EnrichedMotion[]
}

async function loadPlaylistStateOnly(service: SupabaseClient, boardMeetingId: string) {
  const { data: playlist } = await service
    .from('meeting_playlists')
    .select('playback_state, held_item_id, current_item_id')
    .eq('board_meeting_id', boardMeetingId)
    .maybeSingle()

  if (!playlist) return null
  return {
    playback_state: playlist.playback_state,
    held_item_id: playlist.held_item_id,
    current_item_id: playlist.current_item_id,
  }
}

export async function buildControlSurfaceBundle(
  service: SupabaseClient,
  productionId: string,
  options: BuildControlBundleOptions = {},
): Promise<ControlBundleBuild | null> {
  const slim = options.slim ?? false

  const { data: bm } = await service.from('board_meetings').select('*').eq('production_id', productionId).maybeSingle()
  if (!bm) return null

  const [
    { data: state },
    { data: assignments },
    { data: timers },
    channels,
    timer_templates,
    { data: liveEvents },
    people,
    { data: prod },
    attendance,
    motions,
    playlistBundle,
  ] = await Promise.all([
    service.from('meeting_broadcast_state').select('*').eq('board_meeting_id', bm.id).maybeSingle(),
    service
      .from('channel_assignments')
      .select('id, output_channel_id, assigned_at, unassigned_at, show_channel_ident')
      .eq('board_meeting_id', bm.id)
      .is('unassigned_at', null),
    service
      .from('meeting_timers')
      .select('*')
      .eq('board_meeting_id', bm.id)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1),
    getCachedOutputChannels(service),
    slim ? Promise.resolve([]) : getCachedTimerTemplates(service),
    service
      .from('meeting_event_log')
      .select('occurred_at')
      .eq('board_meeting_id', bm.id)
      .in('event_type', LIVE_EVENT_TYPES)
      .order('occurred_at', { ascending: false })
      .limit(1),
    getCachedBoardMemberPeople(service),
    service
      .from('productions')
      .select('production_number, livestream_url, title')
      .eq('id', productionId)
      .maybeSingle(),
    loadAttendance(service, bm.id),
    listMotionsEnriched(service, bm.id, { openOnly: true, voteCountsOnly: true }),
    slim ? Promise.resolve(null) : loadMeetingPlaylistBundle(service, bm.id),
  ])

  const [lowerThirdActive, playlist_state, current_documents] = await Promise.all([
    buildPublicLowerThirdPayload(service, state?.active_lower_third_person_id),
    playlistBundle
      ? Promise.resolve({
          playback_state: playlistBundle.playlist.playback_state,
          held_item_id: playlistBundle.playlist.held_item_id,
          current_item_id: playlistBundle.playlist.current_item_id,
        })
      : loadPlaylistStateOnly(service, bm.id),
    state?.current_agenda_item_id
      ? service
          .from('board_meeting_agenda_documents')
          .select('title, source_url')
          .eq('agenda_item_id', state.current_agenda_item_id)
          .order('sort_order')
          .then(({ data }) => data || [])
      : Promise.resolve([]),
  ])

  const agenda_people = await loadAgendaPeople(service, bm.id, people)

  const liveEvent = liveEvents?.[0]
  const modeEndsAt =
    state?.mode_started_at && state.mode_duration_seconds
      ? new Date(new Date(state.mode_started_at).getTime() + state.mode_duration_seconds * 1000).toISOString()
      : null

  const motion_lifecycle = buildMotionLifecycle(state, motions)
  const result_overlay = buildResultOverlay(state, motions)

  const agendaNav = await resolveAgendaNavigation(
    service,
    bm.id,
    !!bm.agenda_locked,
    state?.current_agenda_item_id,
  )
  const agenda_items = agendaNav.broadcastable_items
  const current_agenda_item = agendaNav.current_item

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

  const meeting_playlist = playlistBundle
    ? {
        playlist: playlistBundle.playlist,
        items: playlistBundle.items.map(it => {
          const asset = it.media_asset_id ? playlistBundle.assets.get(it.media_asset_id) : null
          return { ...it, asset_url: asset ? mediaPublicUrl(service, asset.storage_path) : null }
        }),
      }
    : null

  const bundle: ControlBundle = {
    meeting: {
      title: prod?.title || 'Board Meeting',
      production_number: prod?.production_number ?? null,
      quorum_size: attendance.quorum.threshold,
    },
    broadcast_state,
    agenda_items,
    current_agenda_item,
    items: agenda_items,
    motion_lifecycle,
    attendance: { records: attendance.records, quorum: attendance.quorum },
    lower_third_active: lowerThirdActive,
    lower_third_people: people || [],
    agenda_people,
    result_overlay,
    playlist_state,
    channel_assignments: (assignments || []).map(a => ({
      output_channel_id: a.output_channel_id,
      show_channel_ident: !!a.show_channel_ident,
    })),
    channels: channels || [],
    output_channels: channels || [],
    active_timer: timers?.[0] ?? null,
    recent_events: [],
    timer_templates: timer_templates || [],
    meeting_playlist,
    board_meeting: bm,
    production: prod,
    active_lower_third: lowerThirdActive,
    current_documents,
  }

  return { bundle, motions }
}

/** Full utilities payload for background hydration after slim SSR. */
export { loadControlUtilities }
