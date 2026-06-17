import type { SupabaseClient } from '@supabase/supabase-js'
import { getActiveQrRemainingSeconds, isQrActive, clearExpiredQrIfNeeded } from '@/lib/board-meetings/qr-control'
import { buildPublicActiveMotionForOutputs, buildPublicVoteResultPayload } from '@/lib/board-meetings/motion-control'
import type { PublicActiveMotion, PublicActiveVoteResult } from '@/lib/board-meetings/motion-types'
import type { PublicPlaylistState } from '@/lib/board-meetings/playlist-types'
import {
  buildPublicLowerThirdPayload,
  normalizeLowerThirdPosition,
  type PublicActiveLowerThird,
} from '@/lib/board-meetings/lower-third-control'
import {
  buildPublicPlaylistPayload,
  loadMeetingPlaylistBundle,
  shouldPlaylistRun,
  tickMeetingPlaylist,
} from '@/lib/board-meetings/playlist-playback'
import { resolveAgendaNavigation } from '@/lib/board-meetings/control-meeting-cache'
import { resolveOutputPollIntervalMs } from '@/lib/board-meetings/output-polling'

export type { PublicActiveMotion, PublicActiveVoteResult, PublicActiveLowerThird }

/** Vote result banner for overlay + control bundle (same shape). */
export type PublicVoteResultOverlay = {
  active: boolean
  motion_id: string
  passed: boolean
  yea_count: number
  nay_count: number
  abstain_count: number
  started_at: string
  total_duration: number
  seconds_remaining: number
  held: boolean
}

const LIVE_EVENT_TYPES = ['meeting_went_live', 'go_live']
const ADVANCE_EVENT_TYPES = ['agenda_item_advanced', 'advance', 'jump_to']

type OutputChannelRow = {
  id: string
  channel_number: number
  channel_name: string
  view_type: string
  obs_polling_enabled: boolean
}

function attachPollingMeta(
  channel: OutputChannelRow,
  active: boolean,
  broadcast_status: string | null,
  state: Omit<PublicChannelState, 'obs_polling_enabled' | 'poll_interval_ms'>,
): PublicChannelState {
  const obs_polling_enabled = !!channel.obs_polling_enabled
  return {
    ...state,
    obs_polling_enabled,
    poll_interval_ms: resolveOutputPollIntervalMs({
      obs_polling_enabled,
      active,
      view_type: channel.view_type,
      broadcast_status,
    }),
  }
}

export type PublicAgendaItem = {
  id: string
  section_number: number
  section_title: string
  item_number: string
  title: string
  type: string
  action_requested?: boolean
  suggested_motion_text?: string | null
  presenters: { name: string; title: string | null }[]
  documents: { title: string; source_url: string | null }[]
}

export type PublicAgendaItemSummary = {
  id: string
  item_number: string
  title: string
  type: string
}

function toAgendaItemSummaries(
  items: { id: string; item_number: string; title: string; type: string }[],
): PublicAgendaItemSummary[] {
  return items.map(i => ({
    id: i.id,
    item_number: i.item_number,
    title: i.title,
    type: i.type,
  }))
}

export type PublicActiveQr = {
  url: string
  label: string
  remaining_seconds: number
}

export type PublicChannelState = {
  active: boolean
  /** Dashboard toggle — when false, browser sources poll only occasionally for config changes. */
  obs_polling_enabled: boolean
  /** Recommended client poll interval (ms); derived from assignment, go-live, and view type. */
  poll_interval_ms: number
  channel_number: number
  channel_name: string
  result_overlay: PublicVoteResultOverlay | null
  meeting: {
    title: string
    type: string | null
    date: string | null
    location: string | null
    broadcast_status: string
    production_number: number | null
    youtube_url: string | null
    scheduled_public_start: string | null
  } | null
  state: {
    mode: string
    overlay_visible: boolean
    mode_message: string | null
    mode_started_at: string | null
    mode_duration_seconds: number | null
    active_qr: PublicActiveQr | null
    active_motion: PublicActiveMotion | null
    active_vote_result: PublicActiveVoteResult | null
    active_lower_third: PublicActiveLowerThird | null
    lower_third_position: 'left' | 'center' | 'right'
    agenda_branding_hold: boolean
    playlist: PublicPlaylistState | null
  } | null
  current_item: PublicAgendaItem | null
  upcoming_items: PublicAgendaItemSummary[]
  /** Full broadcastable agenda for pre-roll preview (not limited to "up next"). */
  agenda_preview_items: PublicAgendaItemSummary[]
  completed_items: { id: string; number: string; title: string; started_at_offset_seconds: number }[]
  timer: {
    label: string
    duration_seconds: number
    remaining_seconds: number
    show_on_broadcast: boolean
    show_on_speaker_monitor: boolean
    show_on_dais: boolean
  } | null
  live_started_at: string | null
  /** Meeting elapsed clock for dais / displays (independent of go-live). */
  elapsed_started_at: string | null
  /** When true, outputs show CSDtv branding instead of the current agenda item. */
  agenda_branding_hold: boolean
  /** Operator opt-in: show channel identification card (default off). */
  show_channel_ident: boolean
}

async function loadItemExtras(
  service: SupabaseClient,
  itemId: string,
): Promise<{ presenters: PublicAgendaItem['presenters']; documents: PublicAgendaItem['documents'] }> {
  const [{ data: pres }, { data: docs }] = await Promise.all([
    service.from('board_meeting_presenters').select('name, title').eq('agenda_item_id', itemId).order('sort_order'),
    service
      .from('board_meeting_agenda_documents')
      .select('title, source_url')
      .eq('agenda_item_id', itemId)
      .order('sort_order'),
  ])
  return {
    presenters: (pres || []).map(p => ({ name: p.name, title: p.title })),
    documents: (docs || []).map(d => ({ title: d.title, source_url: d.source_url })),
  }
}

/** Presenters/documents for a single agenda item — used when pushing live patches over Realtime. */
export async function loadAgendaItemExtras(
  service: SupabaseClient,
  itemId: string,
): Promise<{ presenters: PublicAgendaItem['presenters']; documents: PublicAgendaItem['documents'] }> {
  return loadItemExtras(service, itemId)
}

/**
 * Fresh read of an agenda item's suggested motion text, bypassing the in-memory
 * locked-agenda cache. Returns `undefined` if the column doesn't exist or on error
 * (so callers leave the existing value alone), otherwise the current value.
 * This is what makes "Update on screen" reliably reach the dais even though the
 * locked agenda is cached per server instance.
 */
export async function loadAgendaItemSuggestedText(
  service: SupabaseClient,
  itemId: string,
): Promise<string | null | undefined> {
  const { data, error } = await service
    .from('board_meeting_agenda_items')
    .select('suggested_motion_text')
    .eq('id', itemId)
    .maybeSingle()
  if (error) return undefined
  return (data?.suggested_motion_text as string | null | undefined) ?? null
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

export async function buildPublicChannelState(
  service: SupabaseClient,
  channelNumber: number,
): Promise<PublicChannelState | null> {
  const { data: channel } = await service
    .from('output_channels')
    .select('id, channel_number, channel_name, view_type, obs_polling_enabled')
    .eq('channel_number', channelNumber)
    .eq('is_active', true)
    .maybeSingle()

  if (!channel) return null

  const channelRow = channel as OutputChannelRow

  const idleCore = {
    active: false,
    channel_number: channelRow.channel_number,
    channel_name: channelRow.channel_name,
    result_overlay: null,
    meeting: null,
    state: null,
    current_item: null,
    upcoming_items: [] as PublicChannelState['upcoming_items'],
    agenda_preview_items: [] as PublicChannelState['agenda_preview_items'],
    completed_items: [] as PublicChannelState['completed_items'],
    timer: null,
    live_started_at: null,
    elapsed_started_at: null,
    agenda_branding_hold: false,
    show_channel_ident: false,
  }

  const { data: assignment } = await service
    .from('channel_assignments')
    .select('board_meeting_id, show_channel_ident')
    .eq('output_channel_id', channelRow.id)
    .is('unassigned_at', null)
    .maybeSingle()

  if (!assignment?.board_meeting_id) {
    return attachPollingMeta(channelRow, false, null, idleCore)
  }

  const { data: bm } = await service
    .from('board_meetings')
    .select('id, production_id, broadcast_status, scheduled_public_start, agenda_locked')
    .eq('id', assignment.board_meeting_id)
    .maybeSingle()

  if (!bm) return attachPollingMeta(channelRow, false, null, idleCore)

  const { data: prod } = await service
    .from('productions')
    .select('production_number, title, start_datetime, request_type_label, filming_location, event_location, livestream_url')
    .eq('id', bm.production_id)
    .maybeSingle()

  const { data: bstate } = await service
    .from('meeting_broadcast_state')
    .select('*')
    .eq('board_meeting_id', bm.id)
    .maybeSingle()

  const agendaNav = await resolveAgendaNavigation(
    service,
    bm.id,
    !!bm.agenda_locked,
    bstate?.current_agenda_item_id,
  )
  const items = agendaNav.broadcastable_items

  let current_item: PublicAgendaItem | null = null
  if (agendaNav.current_item) {
    const [extras, freshSuggested] = await Promise.all([
      loadItemExtras(service, agendaNav.current_item.id),
      loadAgendaItemSuggestedText(service, agendaNav.current_item.id),
    ])
    current_item = { ...agendaNav.current_item, ...extras }
    if (freshSuggested !== undefined) current_item.suggested_motion_text = freshSuggested
  }

  const agenda_preview_items = toAgendaItemSummaries(items)
  const upcoming_items = toAgendaItemSummaries(agendaNav.upcoming_items)

  const currentIdx = bstate?.current_agenda_item_id
    ? items.findIndex(i => i.id === bstate.current_agenda_item_id)
    : -1
  const currentRow = agendaNav.current_item
  const completedSource =
    currentIdx >= 0
      ? items.slice(0, currentIdx)
      : currentRow
        ? items.filter(i => i.sort_order < currentRow.sort_order)
        : []

  const { data: events } = await service
    .from('meeting_event_log')
    .select('event_type, event_data, occurred_at')
    .eq('board_meeting_id', bm.id)
    .order('occurred_at', { ascending: true })

  const liveEvent = (events || []).find(e => LIVE_EVENT_TYPES.includes(e.event_type))
  const live_started_at = liveEvent?.occurred_at ?? bm.scheduled_public_start ?? null
  const t0 = live_started_at ? new Date(live_started_at).getTime() : null

  const completed_items: PublicChannelState['completed_items'] = []
  if (t0 && completedSource.length > 0) {
    for (const it of completedSource) {
      let offset = 0
      const adv = (events || []).find(e => {
        if (!ADVANCE_EVENT_TYPES.includes(e.event_type)) return false
        const d = e.event_data as { agenda_item_id?: string } | null
        return d?.agenda_item_id === it.id
      })
      if (adv) offset = Math.max(0, Math.floor((new Date(adv.occurred_at).getTime() - t0) / 1000))
      completed_items.push({
        id: it.id,
        number: it.item_number,
        title: it.title,
        started_at_offset_seconds: offset,
      })
    }
  }

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

  let active_qr: PublicActiveQr | null = null
  if (bstate?.active_qr_url) {
    if (isQrActive(bstate)) {
      active_qr = {
        url: bstate.active_qr_url!,
        label: bstate.active_qr_label || 'Scan',
        remaining_seconds: getActiveQrRemainingSeconds(bstate),
      }
    } else {
      await clearExpiredQrIfNeeded(service, bm.id, bstate)
    }
  }

  const result_overlay = await buildVoteResultOverlay(service, bm.id, bstate)

  let active_motion: PublicActiveMotion | null = null
  let active_vote_result: PublicActiveVoteResult | null = null

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
    active_motion = await buildPublicActiveMotionForOutputs(service, bstate.active_motion_id, bm.id)
  }

  const active_lower_third = await buildPublicLowerThirdPayload(
    service,
    bstate?.active_lower_third_person_id,
  )

  let playlist: PublicPlaylistState | null = null
  if (channelRow.view_type === 'preroll') {
    let bundle = await loadMeetingPlaylistBundle(service, bm.id)
    if (bundle && shouldPlaylistRun(bundle.playlist, bm.broadcast_status, bstate?.mode ?? 'normal')) {
      bundle = await tickMeetingPlaylist(service, bundle, bm.broadcast_status, bstate?.mode ?? 'normal')
      playlist = await buildPublicPlaylistPayload(service, bundle)
    } else if (bundle) {
      playlist = await buildPublicPlaylistPayload(service, bundle)
    }
  }

  return attachPollingMeta(channelRow, true, bm.broadcast_status, {
    active: true,
    show_channel_ident: !!assignment.show_channel_ident,
    channel_number: channelRow.channel_number,
    channel_name: channelRow.channel_name,
    result_overlay,
    meeting: {
      title: prod?.title || 'Board Meeting',
      type: prod?.request_type_label ?? null,
      date: prod?.start_datetime ?? null,
      location: prod?.event_location || prod?.filming_location || null,
      broadcast_status: bm.broadcast_status,
      production_number: prod?.production_number ?? null,
      youtube_url: prod?.livestream_url ?? null,
      scheduled_public_start: bm.scheduled_public_start,
    },
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
      lower_third_position: normalizeLowerThirdPosition(bstate?.lower_third_position),
      agenda_branding_hold: !!bstate?.agenda_branding_hold,
      playlist,
    },
    current_item,
    upcoming_items,
    agenda_preview_items,
    completed_items,
    timer: timerPayload,
    live_started_at,
    elapsed_started_at: (bstate?.elapsed_started_at as string | null | undefined) ?? null,
    agenda_branding_hold: !!bstate?.agenda_branding_hold,
  })
}

/** Full broadcastable agenda with presenters/docs — one fetch for dais browser cache. */
export async function buildPublicAgendaItemsForChannel(
  service: SupabaseClient,
  channelNumber: number,
): Promise<PublicAgendaItem[]> {
  const { data: channel } = await service
    .from('output_channels')
    .select('id')
    .eq('channel_number', channelNumber)
    .eq('is_active', true)
    .maybeSingle()

  if (!channel) return []

  const { data: assignment } = await service
    .from('channel_assignments')
    .select('board_meeting_id')
    .eq('output_channel_id', channel.id)
    .is('unassigned_at', null)
    .maybeSingle()

  if (!assignment?.board_meeting_id) return []

  const { data: bm } = await service
    .from('board_meetings')
    .select('id, agenda_locked')
    .eq('id', assignment.board_meeting_id)
    .maybeSingle()

  if (!bm) return []

  const agendaNav = await resolveAgendaNavigation(service, bm.id, !!bm.agenda_locked, null)
  const rows = agendaNav.broadcastable_items

  return Promise.all(
    rows.map(async row => {
      const extras = await loadItemExtras(service, row.id)
      return {
        id: row.id,
        section_number: row.section_number,
        section_title: row.section_title,
        item_number: row.item_number,
        title: row.title,
        type: row.type,
        ...extras,
      }
    }),
  )
}
