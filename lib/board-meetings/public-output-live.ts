import type { SupabaseClient } from '@supabase/supabase-js'
import { getAgendaItemsForControl } from '@/lib/board-meetings/control-meeting-cache'
import { getActiveQrRemainingSeconds, isQrActive } from '@/lib/board-meetings/qr-control'
import { buildPublicMotionPayload, buildPublicVoteResultPayload } from '@/lib/board-meetings/motion-control'
import { buildPublicLowerThirdPayload } from '@/lib/board-meetings/lower-third-control'
import {
  buildPublicPlaylistPayload,
  loadMeetingPlaylistBundle,
  shouldPlaylistRun,
  tickMeetingPlaylist,
} from '@/lib/board-meetings/playlist-playback'
import type {
  PublicAgendaItem,
  PublicChannelState,
  PublicVoteResultOverlay,
} from '@/lib/board-meetings/public-output-state'

/** Volatile overlay fields — no event log, completed list, or presenter/doc lookups. */
export type PublicChannelLivePatch = Pick<
  PublicChannelState,
  'active' | 'result_overlay' | 'state' | 'current_item' | 'timer' | 'upcoming_items'
> & {
  meeting?: Pick<NonNullable<PublicChannelState['meeting']>, 'broadcast_status'> | null
}

async function buildVoteResultOverlay(
  service: SupabaseClient,
  boardMeetingId: string,
  broadcastState: Record<string, unknown> | null | undefined,
): Promise<PublicVoteResultOverlay | null> {
  const activeResultId = broadcastState?.active_vote_result_motion_id as string | undefined
  const voteResultStartedAt = broadcastState?.vote_result_started_at as string | undefined
  if (!activeResultId || !voteResultStartedAt) return null

  const startedAt = new Date(voteResultStartedAt).getTime()
  const elapsed = Math.floor((Date.now() - startedAt) / 1000)
  const total = (broadcastState?.vote_result_duration_seconds as number | undefined) || 8
  const held = !!broadcastState?.vote_result_held
  const remaining = held ? total : Math.max(0, total - elapsed)

  if (!held && remaining <= 0) return null

  const { data: motionRow } = await service
    .from('meeting_motions')
    .select('id, result, tally_yea, tally_nay, tally_abstain')
    .eq('id', activeResultId)
    .eq('board_meeting_id', boardMeetingId)
    .maybeSingle()

  if (!motionRow?.result) return null

  return {
    active: true,
    motion_id: activeResultId,
    passed: motionRow.result === 'passed',
    yea_count: motionRow.tally_yea ?? 0,
    nay_count: motionRow.tally_nay ?? 0,
    abstain_count: motionRow.tally_abstain ?? 0,
    started_at: voteResultStartedAt,
    total_duration: total,
    seconds_remaining: remaining,
    held,
  }
}

export function mergePublicChannelState(
  prev: PublicChannelState,
  live: PublicChannelLivePatch,
): PublicChannelState {
  const nextItem = live.current_item
  const mergedItem =
    nextItem === undefined
      ? prev.current_item
      : !nextItem
        ? null
        : prev.current_item?.id === nextItem.id
          ? { ...nextItem, presenters: prev.current_item.presenters, documents: prev.current_item.documents }
          : { ...nextItem, presenters: [], documents: [] }

  return {
    ...prev,
    active: live.active ?? prev.active,
    meeting:
      live.meeting !== undefined && prev.meeting
        ? { ...prev.meeting, ...live.meeting }
        : prev.meeting,
    result_overlay: live.result_overlay !== undefined ? live.result_overlay : prev.result_overlay,
    current_item: mergedItem,
    upcoming_items: live.upcoming_items !== undefined ? live.upcoming_items : prev.upcoming_items,
    timer: live.timer !== undefined ? live.timer : prev.timer,
    state:
      live.state && prev.state
        ? { ...prev.state, ...live.state }
        : live.state !== undefined
          ? live.state
          : prev.state,
  }
}

export async function buildPublicChannelLivePatch(
  service: SupabaseClient,
  channelNumber: number,
): Promise<PublicChannelLivePatch | null> {
  const { data: channel } = await service
    .from('output_channels')
    .select('id, channel_number, channel_name, view_type')
    .eq('channel_number', channelNumber)
    .eq('is_active', true)
    .maybeSingle()

  if (!channel) return null

  const idle: PublicChannelLivePatch = {
    active: false,
    result_overlay: null,
    state: null,
    current_item: null,
    upcoming_items: [],
    timer: null,
  }

  const { data: assignment } = await service
    .from('channel_assignments')
    .select('board_meeting_id')
    .eq('output_channel_id', channel.id)
    .is('unassigned_at', null)
    .maybeSingle()

  if (!assignment?.board_meeting_id) return idle

  const { data: bm } = await service
    .from('board_meetings')
    .select('id, production_id, broadcast_status')
    .eq('id', assignment.board_meeting_id)
    .maybeSingle()

  if (!bm) return idle

  const { data: bstate } = await service
    .from('meeting_broadcast_state')
    .select('*')
    .eq('board_meeting_id', bm.id)
    .maybeSingle()

  const { data: bmMeta } = await service
    .from('board_meetings')
    .select('agenda_locked')
    .eq('id', bm.id)
    .maybeSingle()

  const items = await getAgendaItemsForControl(service, bm.id, !!bmMeta?.agenda_locked)
  const currentIdx = bstate?.current_agenda_item_id
    ? items.findIndex(i => i.id === bstate.current_agenda_item_id)
    : -1
  const currentRow = currentIdx >= 0 ? items[currentIdx] : null

  const current_item: PublicAgendaItem | null = currentRow
    ? { ...currentRow, presenters: [], documents: [] }
    : null

  const upcoming_items = items
    .slice(currentIdx >= 0 ? currentIdx + 1 : 0, currentIdx >= 0 ? currentIdx + 4 : 3)
    .map(i => ({ id: i.id, item_number: i.item_number, title: i.title, type: i.type }))

  let timerPayload: PublicChannelState['timer'] = null
  if (bstate?.active_timer_id) {
    const { data: timer } = await service
      .from('meeting_timers')
      .select('*')
      .eq('id', bstate.active_timer_id)
      .is('ended_at', null)
      .maybeSingle()
    if (timer) {
      const elapsed = Math.floor((Date.now() - new Date(timer.started_at).getTime()) / 1000)
      timerPayload = {
        label: timer.label || 'Timer',
        duration_seconds: timer.duration_seconds,
        remaining_seconds: Math.max(0, timer.duration_seconds - elapsed),
        show_on_broadcast: timer.show_on_broadcast,
        show_on_speaker_monitor: timer.show_on_speaker_monitor,
        show_on_dais: timer.show_on_dais,
      }
    }
  }

  let active_qr = null
  if (bstate && isQrActive(bstate)) {
    active_qr = {
      url: bstate.active_qr_url!,
      label: bstate.active_qr_label || 'Scan',
      remaining_seconds: getActiveQrRemainingSeconds(bstate),
    }
  }

  const result_overlay = await buildVoteResultOverlay(service, bm.id, bstate)

  let active_motion = null
  let active_vote_result = null

  if (result_overlay) {
    active_vote_result = await buildPublicVoteResultPayload(
      service,
      result_overlay.motion_id,
      bm.id,
      result_overlay.seconds_remaining,
      {
        held: result_overlay.held,
        started_at: result_overlay.started_at,
        total_duration: result_overlay.total_duration,
      },
    )
  } else if (bstate?.active_motion_id) {
    active_motion = await buildPublicMotionPayload(service, bstate.active_motion_id, bm.id)
  }

  const active_lower_third = await buildPublicLowerThirdPayload(service, bstate?.active_lower_third_person_id)

  let playlist = null
  if (channel.view_type === 'preroll') {
    let bundle = await loadMeetingPlaylistBundle(service, bm.id)
    if (bundle && shouldPlaylistRun(bundle.playlist, bm.broadcast_status, bstate?.mode ?? 'normal')) {
      bundle = await tickMeetingPlaylist(service, bundle, bm.broadcast_status, bstate?.mode ?? 'normal')
      playlist = await buildPublicPlaylistPayload(service, bundle)
    } else if (bundle) {
      playlist = await buildPublicPlaylistPayload(service, bundle)
    }
  }

  return {
    active: true,
    meeting: { broadcast_status: bm.broadcast_status },
    result_overlay,
    state: {
      mode: bstate?.mode ?? 'normal',
      overlay_visible: bstate?.overlay_visible ?? true,
      mode_message: bstate?.mode_message ?? null,
      mode_started_at: bstate?.mode_started_at ?? null,
      mode_duration_seconds: bstate?.mode_duration_seconds ?? null,
      active_qr,
      active_motion,
      active_vote_result,
      active_lower_third,
      playlist,
    },
    current_item,
    upcoming_items,
    timer: timerPayload,
  }
}
