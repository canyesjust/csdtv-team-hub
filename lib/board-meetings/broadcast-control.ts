import type { SupabaseClient } from '@supabase/supabase-js'
import { getAgendaItemsForControl } from '@/lib/board-meetings/control-meeting-cache'
import { invalidateOutputChannelsCache } from '@/lib/board-meetings/control-static-cache'
import { stopPlaylistOnGoLive } from '@/lib/board-meetings/playlist-playback'

export type BroadcastStateRow = {
  id: string
  board_meeting_id: string
  current_agenda_item_id: string | null
  overlay_visible: boolean
  mode: 'normal' | 'recess' | 'technical_difficulties'
  mode_started_at: string | null
  mode_duration_seconds: number | null
  mode_message: string | null
  active_timer_id: string | null
  elapsed_started_at: string | null
  agenda_branding_hold: boolean
  updated_at: string
  updated_by: string | null
}

export type AgendaItemRow = {
  id: string
  sort_order: number
  is_broadcastable: boolean
  section_number: number
  section_title: string
  item_number: string
  title: string
  type: string
}

export async function logMeetingEvent(
  service: SupabaseClient,
  boardMeetingId: string,
  eventType: string,
  operatorId: string,
  eventData?: Record<string, unknown>,
) {
  const row = {
    board_meeting_id: boardMeetingId,
    event_type: eventType,
    event_data: eventData ?? null,
    operator_id: operatorId,
  }
  let { error } = await service.from('meeting_event_log').insert(row)
  if (error?.code === '23503') {
    ;({ error } = await service.from('meeting_event_log').insert({ ...row, operator_id: null }))
  }
  if (error) throw new Error(`Failed to log meeting event (${eventType}): ${error.message}`)
}

export async function ensureBroadcastState(
  service: SupabaseClient,
  boardMeetingId: string,
  operatorId: string,
): Promise<BroadcastStateRow> {
  const { data: existing } = await service
    .from('meeting_broadcast_state')
    .select('*')
    .eq('board_meeting_id', boardMeetingId)
    .maybeSingle()

  if (existing) return existing as BroadcastStateRow

  const { data: created, error } = await service
    .from('meeting_broadcast_state')
    .insert({
      board_meeting_id: boardMeetingId,
      overlay_visible: true,
      mode: 'normal',
      updated_by: operatorId,
    })
    .select('*')
    .single()

  if (error || !created) throw new Error(error?.message || 'Failed to create broadcast state')
  return created as BroadcastStateRow
}

export async function loadBroadcastableItems(
  service: SupabaseClient,
  boardMeetingId: string,
): Promise<AgendaItemRow[]> {
  const { data: bm } = await service
    .from('board_meetings')
    .select('agenda_locked')
    .eq('id', boardMeetingId)
    .maybeSingle()

  if (bm?.agenda_locked) {
    const cached = await getAgendaItemsForControl(service, boardMeetingId, true)
    return cached.map(i => ({
      id: i.id,
      sort_order: i.sort_order,
      is_broadcastable: i.is_broadcastable,
      section_number: i.section_number,
      section_title: i.section_title,
      item_number: i.item_number,
      title: i.title,
      type: i.type,
    }))
  }

  const { data } = await service
    .from('board_meeting_agenda_items')
    .select('id, sort_order, is_broadcastable, section_number, section_title, item_number, title, type')
    .eq('board_meeting_id', boardMeetingId)
    .eq('is_broadcastable', true)
    .order('sort_order', { ascending: true })
  return (data || []) as AgendaItemRow[]
}

function findAdjacent(
  items: AgendaItemRow[],
  currentId: string | null,
  direction: 1 | -1,
): AgendaItemRow | null {
  if (items.length === 0) return null
  if (!currentId) return items[0]
  const idx = items.findIndex(i => i.id === currentId)
  if (idx < 0) return items[0]
  const next = idx + direction
  if (next < 0 || next >= items.length) return null
  return items[next]
}

export async function setAgendaBrandingHold(
  service: SupabaseClient,
  boardMeetingId: string,
  operatorId: string,
  hold: boolean,
) {
  const patch = {
    agenda_branding_hold: hold,
    updated_at: new Date().toISOString(),
    updated_by: operatorId,
  }

  const { data: updated, error } = await service
    .from('meeting_broadcast_state')
    .update(patch)
    .eq('board_meeting_id', boardMeetingId)
    .select('id')
    .maybeSingle()

  if (error) {
    throw new Error(
      error.message.includes('agenda_branding_hold')
        ? 'Agenda branding column missing — run db/board_meetings_agenda_branding_hold.sql migration'
        : error.message,
    )
  }
  if (!updated) {
    await ensureBroadcastState(service, boardMeetingId, operatorId)
    await service.from('meeting_broadcast_state').update(patch).eq('board_meeting_id', boardMeetingId)
  }

  void logMeetingEvent(service, boardMeetingId, hold ? 'agenda_branding_hold' : 'agenda_branding_clear', operatorId)
}

export async function setCurrentItem(
  service: SupabaseClient,
  boardMeetingId: string,
  itemId: string | null,
  operatorId: string,
) {
  const { findPrimaryMotionIdForAgendaItem } = await import('@/lib/board-meetings/agenda-motions-sync')
  let activeMotionId: string | null = null
  if (itemId) {
    const candidateId = await findPrimaryMotionIdForAgendaItem(service, boardMeetingId, itemId)
    if (candidateId) {
      const { data: motion } = await service
        .from('meeting_motions')
        .select('status, moved_by_person_id')
        .eq('id', candidateId)
        .maybeSingle()
      if (motion && (motion.status === 'voting' || motion.moved_by_person_id)) {
        activeMotionId = candidateId
      }
    }
  }

  const patch = {
    current_agenda_item_id: itemId,
    active_motion_id: activeMotionId,
    agenda_branding_hold: false,
    // Moving to an agenda item clears any vote result that was held on screen.
    // (Results stay up until this happens — they do not auto-disappear.)
    active_vote_result_motion_id: null,
    vote_result_started_at: null,
    vote_result_duration_seconds: null,
    vote_result_held: false,
    updated_at: new Date().toISOString(),
    updated_by: operatorId,
  }

  const { data: updated, error } = await service
    .from('meeting_broadcast_state')
    .update(patch)
    .eq('board_meeting_id', boardMeetingId)
    .select('id')
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (updated) return

  await ensureBroadcastState(service, boardMeetingId, operatorId)
  const { error: retryError } = await service
    .from('meeting_broadcast_state')
    .update(patch)
    .eq('board_meeting_id', boardMeetingId)
  if (retryError) throw new Error(retryError.message)
}

/** Stop pre-roll and start the live meeting (overlay/dais agenda, etc.). */
export async function endPrerollAndStartMeeting(
  service: SupabaseClient,
  boardMeetingId: string,
  operatorId: string,
) {
  const { data: bm } = await service
    .from('board_meetings')
    .select('broadcast_status, agenda_locked')
    .eq('id', boardMeetingId)
    .single()

  if (!bm?.agenda_locked) throw new Error('Agenda must be locked before ending preroll')
  if (bm.broadcast_status === 'archived' || bm.broadcast_status === 'cancelled') {
    throw new Error('Meeting is not active')
  }

  const items = await loadBroadcastableItems(service, boardMeetingId)
  const state = await ensureBroadcastState(service, boardMeetingId, operatorId)
  const first = items[0]?.id ?? null
  const current = state.current_agenda_item_id || first

  const now = new Date().toISOString()

  await service
    .from('board_meetings')
    .update({ broadcast_status: 'live', live_started_at: now, updated_at: now })
    .eq('id', boardMeetingId)

  // Start the meeting elapsed clock at the gavel so the dais / displays count up
  // from go-live. (Only set it if it isn't already running, so re-confirming
  // go-live doesn't reset the clock.)
  if (!state.elapsed_started_at) {
    await service
      .from('meeting_broadcast_state')
      .update({ elapsed_started_at: now, updated_at: now, updated_by: operatorId })
      .eq('board_meeting_id', boardMeetingId)
  }

  await stopPlaylistOnGoLive(service, boardMeetingId)

  if (!state.current_agenda_item_id && first) {
    await setCurrentItem(service, boardMeetingId, first, operatorId)
    await logMeetingEvent(service, boardMeetingId, 'agenda_item_advanced', operatorId, { agenda_item_id: first })
  } else if (current && current !== state.current_agenda_item_id) {
    await setCurrentItem(service, boardMeetingId, current, operatorId)
  }

  const itemId = current || first
  await logMeetingEvent(service, boardMeetingId, 'meeting_went_live', operatorId, { current_item_id: itemId })
  await logMeetingEvent(service, boardMeetingId, 'go_live', operatorId, { current_item_id: itemId })
}

export async function endMeeting(
  service: SupabaseClient,
  boardMeetingId: string,
  operatorId: string,
) {
  const { data: activeAssignments } = await service
    .from('channel_assignments')
    .select('output_channel_id')
    .eq('board_meeting_id', boardMeetingId)
    .is('unassigned_at', null)

  await service
    .from('board_meetings')
    .update({ broadcast_status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', boardMeetingId)

  await service
    .from('channel_assignments')
    .update({ unassigned_at: new Date().toISOString(), unassigned_by: operatorId })
    .eq('board_meeting_id', boardMeetingId)
    .is('unassigned_at', null)

  const channelIds = (activeAssignments || []).map(a => a.output_channel_id).filter(Boolean)
  if (channelIds.length > 0) {
    await service
      .from('output_channels')
      .update({ obs_polling_enabled: false, updated_at: new Date().toISOString() })
      .in('id', channelIds)
    invalidateOutputChannelsCache()
  }

  await service
    .from('meeting_broadcast_state')
    .update({
      active_qr_url: null,
      active_qr_label: null,
      active_qr_started_at: null,
      active_qr_duration_seconds: null,
      active_motion_id: null,
      active_vote_result_motion_id: null,
      vote_result_started_at: null,
    })
    .eq('board_meeting_id', boardMeetingId)

  await service
    .from('meeting_broadcast_state')
    .update({
      elapsed_started_at: null,
      agenda_branding_hold: false,
      updated_at: new Date().toISOString(),
      updated_by: operatorId,
    })
    .eq('board_meeting_id', boardMeetingId)

  await logMeetingEvent(service, boardMeetingId, 'end_meeting', operatorId)
}

/** Start or reset the meeting elapsed clock (independent of go-live). */
export async function resetMeetingElapsed(
  service: SupabaseClient,
  boardMeetingId: string,
  operatorId: string,
) {
  const now = new Date().toISOString()
  const { data: updated, error } = await service
    .from('meeting_broadcast_state')
    .update({ elapsed_started_at: now, updated_at: now, updated_by: operatorId })
    .eq('board_meeting_id', boardMeetingId)
    .select('id, elapsed_started_at')
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!updated) {
    await ensureBroadcastState(service, boardMeetingId, operatorId)
    const retry = await service
      .from('meeting_broadcast_state')
      .update({ elapsed_started_at: now, updated_at: now, updated_by: operatorId })
      .eq('board_meeting_id', boardMeetingId)
      .select('elapsed_started_at')
      .single()
    if (retry.error) throw new Error(retry.error.message)
    void logMeetingEvent(service, boardMeetingId, 'elapsed_reset', operatorId)
    return retry.data.elapsed_started_at as string
  }

  void logMeetingEvent(service, boardMeetingId, 'elapsed_reset', operatorId)
  return updated.elapsed_started_at as string
}

export async function clearMeetingElapsed(
  service: SupabaseClient,
  boardMeetingId: string,
  operatorId: string,
) {
  const { error } = await service
    .from('meeting_broadcast_state')
    .update({
      elapsed_started_at: null,
      updated_at: new Date().toISOString(),
      updated_by: operatorId,
    })
    .eq('board_meeting_id', boardMeetingId)
  if (error) throw new Error(error.message)
  void logMeetingEvent(service, boardMeetingId, 'elapsed_cleared', operatorId)
}

export async function advanceItem(
  service: SupabaseClient,
  boardMeetingId: string,
  operatorId: string,
  direction: 1 | -1,
) {
  const [items, stateResult] = await Promise.all([
    loadBroadcastableItems(service, boardMeetingId),
    service
      .from('meeting_broadcast_state')
      .select('current_agenda_item_id')
      .eq('board_meeting_id', boardMeetingId)
      .maybeSingle(),
  ])

  const currentId = stateResult.data?.current_agenda_item_id ?? null
  const next = findAdjacent(items, currentId, direction)
  if (!next) throw new Error(direction > 0 ? 'Already at last item' : 'Already at first item')

  await setCurrentItem(service, boardMeetingId, next.id, operatorId)
  await logMeetingEvent(service, boardMeetingId, direction > 0 ? 'advance' : 'go_back', operatorId, {
    agenda_item_id: next.id,
  })
  return next
}

export async function jumpToItem(
  service: SupabaseClient,
  boardMeetingId: string,
  agendaItemId: string,
  operatorId: string,
) {
  const { data: item } = await service
    .from('board_meeting_agenda_items')
    .select('id, is_broadcastable')
    .eq('id', agendaItemId)
    .eq('board_meeting_id', boardMeetingId)
    .maybeSingle()
  if (!item) throw new Error('Agenda item not found')
  if (!item.is_broadcastable) throw new Error('Item is not broadcastable')
  await setCurrentItem(service, boardMeetingId, agendaItemId, operatorId)
  await logMeetingEvent(service, boardMeetingId, 'agenda_item_advanced', operatorId, { agenda_item_id: agendaItemId })
  await logMeetingEvent(service, boardMeetingId, 'jump_to', operatorId, { agenda_item_id: agendaItemId })
}

export async function toggleOverlay(
  service: SupabaseClient,
  boardMeetingId: string,
  operatorId: string,
  visible?: boolean,
) {
  const { data: state } = await service
    .from('meeting_broadcast_state')
    .select('overlay_visible')
    .eq('board_meeting_id', boardMeetingId)
    .maybeSingle()

  const next = visible ?? !(state?.overlay_visible ?? true)
  const patch = {
    overlay_visible: next,
    updated_at: new Date().toISOString(),
    updated_by: operatorId,
  }

  const { data: updated, error } = await service
    .from('meeting_broadcast_state')
    .update(patch)
    .eq('board_meeting_id', boardMeetingId)
    .select('id')
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!updated) {
    await ensureBroadcastState(service, boardMeetingId, operatorId)
    await service.from('meeting_broadcast_state').update(patch).eq('board_meeting_id', boardMeetingId)
  }

  void logMeetingEvent(service, boardMeetingId, 'toggle_overlay', operatorId, { visible: next })
  return next
}

export async function setBroadcastMode(
  service: SupabaseClient,
  boardMeetingId: string,
  operatorId: string,
  mode: 'normal' | 'recess' | 'technical_difficulties',
  opts?: { message?: string; duration_seconds?: number },
) {
  await ensureBroadcastState(service, boardMeetingId, operatorId)
  const patch: Record<string, unknown> = {
    mode,
    updated_at: new Date().toISOString(),
    updated_by: operatorId,
  }
  if (mode === 'normal') {
    patch.mode_started_at = null
    patch.mode_duration_seconds = null
    patch.mode_message = null
  } else {
    patch.mode_started_at = new Date().toISOString()
    patch.mode_duration_seconds = opts?.duration_seconds ?? null
    patch.mode_message = opts?.message ?? null
  }
  await service.from('meeting_broadcast_state').update(patch).eq('board_meeting_id', boardMeetingId)
  await logMeetingEvent(service, boardMeetingId, mode === 'normal' ? 'clear_mode' : mode, operatorId, {
    message: opts?.message,
    duration_seconds: opts?.duration_seconds,
  })
}

export async function assignChannel(
  service: SupabaseClient,
  boardMeetingId: string,
  outputChannelId: string,
  operatorId: string,
) {
  const { data: channel } = await service
    .from('output_channels')
    .select('id')
    .eq('id', outputChannelId)
    .eq('is_active', true)
    .maybeSingle()
  if (!channel) throw new Error('Channel not found')

  await service
    .from('channel_assignments')
    .update({ unassigned_at: new Date().toISOString(), unassigned_by: operatorId })
    .eq('output_channel_id', outputChannelId)
    .is('unassigned_at', null)

  const { error } = await service.from('channel_assignments').insert({
    output_channel_id: outputChannelId,
    board_meeting_id: boardMeetingId,
    assigned_by: operatorId,
  })
  if (error) throw new Error(error.message)
  await setOutputChannelObsPolling(service, outputChannelId, true)
  await logMeetingEvent(service, boardMeetingId, 'channel_assign', operatorId, { output_channel_id: outputChannelId })
}

export async function setChannelShowIdent(
  service: SupabaseClient,
  boardMeetingId: string,
  outputChannelId: string,
  show: boolean,
  operatorId: string,
) {
  const { error } = await service
    .from('channel_assignments')
    .update({ show_channel_ident: show })
    .eq('board_meeting_id', boardMeetingId)
    .eq('output_channel_id', outputChannelId)
    .is('unassigned_at', null)
  if (error) throw new Error(error.message)
  void logMeetingEvent(service, boardMeetingId, show ? 'channel_ident_on' : 'channel_ident_off', operatorId, {
    output_channel_id: outputChannelId,
  })
}

export async function setOutputChannelObsPolling(
  service: SupabaseClient,
  outputChannelId: string,
  enabled: boolean,
) {
  const { error } = await service
    .from('output_channels')
    .update({ obs_polling_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('id', outputChannelId)
  if (error) throw new Error(error.message)
  invalidateOutputChannelsCache()
}

export async function unassignChannel(
  service: SupabaseClient,
  boardMeetingId: string,
  outputChannelId: string,
  operatorId: string,
) {
  const { error } = await service
    .from('channel_assignments')
    .update({ unassigned_at: new Date().toISOString(), unassigned_by: operatorId })
    .eq('board_meeting_id', boardMeetingId)
    .eq('output_channel_id', outputChannelId)
    .is('unassigned_at', null)
  if (error) throw new Error(error.message)
  await setOutputChannelObsPolling(service, outputChannelId, false)
  await logMeetingEvent(service, boardMeetingId, 'channel_unassign', operatorId, {
    output_channel_id: outputChannelId,
  })
}

export async function startTimer(
  service: SupabaseClient,
  boardMeetingId: string,
  operatorId: string,
  opts: {
    template_id?: string
    duration_seconds?: number
    label?: string
    show_on_broadcast?: boolean
    show_on_speaker_monitor?: boolean
    show_on_dais?: boolean
  },
) {
  let duration = opts.duration_seconds
  let label = opts.label
  let showBroadcast = opts.show_on_broadcast ?? false
  let showSpeaker = opts.show_on_speaker_monitor ?? true
  let showDais = opts.show_on_dais ?? true
  let templateId: string | null = opts.template_id ?? null

  if (opts.template_id) {
    const { data: tpl } = await service.from('timer_templates').select('*').eq('id', opts.template_id).maybeSingle()
    if (!tpl) throw new Error('Timer template not found')
    duration = tpl.duration_seconds
    label = label || tpl.name
    showBroadcast = opts.show_on_broadcast ?? tpl.show_on_broadcast_default
    showSpeaker = opts.show_on_speaker_monitor ?? tpl.show_on_speaker_monitor_default
    showDais = opts.show_on_dais ?? tpl.show_on_dais_default
    templateId = tpl.id
  }

  if (!duration || duration < 1) throw new Error('duration_seconds required')

  await service
    .from('meeting_timers')
    .update({ ended_at: new Date().toISOString(), ended_by: 'cancelled' })
    .eq('board_meeting_id', boardMeetingId)
    .is('ended_at', null)

  const { data: timer, error } = await service
    .from('meeting_timers')
    .insert({
      board_meeting_id: boardMeetingId,
      template_id: templateId,
      label: label || 'Timer',
      duration_seconds: duration,
      show_on_broadcast: showBroadcast,
      show_on_speaker_monitor: showSpeaker,
      show_on_dais: showDais,
      started_by: operatorId,
    })
    .select('*')
    .single()

  if (error || !timer) throw new Error(error?.message || 'Failed to start timer')

  await ensureBroadcastState(service, boardMeetingId, operatorId)
  await service
    .from('meeting_broadcast_state')
    .update({
      active_timer_id: timer.id,
      updated_at: new Date().toISOString(),
      updated_by: operatorId,
    })
    .eq('board_meeting_id', boardMeetingId)

  await logMeetingEvent(service, boardMeetingId, 'start_timer', operatorId, { timer_id: timer.id })
  return timer
}

export async function endActiveTimer(
  service: SupabaseClient,
  boardMeetingId: string,
  operatorId: string,
  endedBy: 'completed' | 'cancelled',
) {
  const state = await ensureBroadcastState(service, boardMeetingId, operatorId)
  if (!state.active_timer_id) throw new Error('No active timer')

  await service
    .from('meeting_timers')
    .update({ ended_at: new Date().toISOString(), ended_by: endedBy })
    .eq('id', state.active_timer_id)

  await service
    .from('meeting_broadcast_state')
    .update({
      active_timer_id: null,
      updated_at: new Date().toISOString(),
      updated_by: operatorId,
    })
    .eq('board_meeting_id', boardMeetingId)

  await logMeetingEvent(service, boardMeetingId, endedBy === 'completed' ? 'end_timer' : 'cancel_timer', operatorId, {
    timer_id: state.active_timer_id,
  })
}

export async function loadControlBundle(
  service: SupabaseClient,
  productionId: string,
  options?: { slim?: boolean },
) {
  const { buildControlSurfaceBundle } = await import('@/lib/board-meetings/control-bundle')
  const built = await buildControlSurfaceBundle(service, productionId, options)
  return built?.bundle ?? null
}

/**
 * Client-side hold/dismiss routing lives in
 * `lib/board-meetings/control-surface-actions.ts` (`dispatchControlSurfaceAction`).
 */
