import type { SupabaseClient } from '@supabase/supabase-js'

export type PublicChannelState = {
  channel_number: number
  channel_name: string
  has_active_meeting: boolean
  meeting?: {
    production_id: string
    broadcast_status: string
    scheduled_public_start: string | null
  }
  broadcast?: {
    overlay_visible: boolean
    mode: string
    mode_message: string | null
    mode_started_at: string | null
    mode_duration_seconds: number | null
    current_item: {
      id: string
      section_number: number
      section_title: string
      item_number: string
      title: string
      type: string
    } | null
    timer: {
      id: string
      label: string
      duration_seconds: number
      started_at: string
      remaining_seconds: number
      show_on_broadcast: boolean
    } | null
  }
  agenda_preview?: { item_number: string; title: string }[]
}

export async function buildPublicChannelState(
  service: SupabaseClient,
  channelNumber: number,
): Promise<PublicChannelState | null> {
  const { data: channel } = await service
    .from('output_channels')
    .select('id, channel_number, channel_name')
    .eq('channel_number', channelNumber)
    .eq('is_active', true)
    .maybeSingle()

  if (!channel) return null

  const base: PublicChannelState = {
    channel_number: channel.channel_number,
    channel_name: channel.channel_name,
    has_active_meeting: false,
  }

  const { data: assignment } = await service
    .from('channel_assignments')
    .select('board_meeting_id')
    .eq('output_channel_id', channel.id)
    .is('unassigned_at', null)
    .maybeSingle()

  if (!assignment?.board_meeting_id) return base

  const { data: bm } = await service
    .from('board_meetings')
    .select('id, production_id, broadcast_status, scheduled_public_start')
    .eq('id', assignment.board_meeting_id)
    .maybeSingle()

  if (!bm) return base

  base.has_active_meeting = true
  base.meeting = {
    production_id: bm.production_id,
    broadcast_status: bm.broadcast_status,
    scheduled_public_start: bm.scheduled_public_start,
  }

  const { data: state } = await service
    .from('meeting_broadcast_state')
    .select('*')
    .eq('board_meeting_id', bm.id)
    .maybeSingle()

  let currentItem = null
  if (state?.current_agenda_item_id) {
    const { data: item } = await service
      .from('board_meeting_agenda_items')
      .select('id, section_number, section_title, item_number, title, type')
      .eq('id', state.current_agenda_item_id)
      .maybeSingle()
    currentItem = item
  }

  let timerPayload = null
  if (state?.active_timer_id) {
    const { data: timer } = await service
      .from('meeting_timers')
      .select('*')
      .eq('id', state.active_timer_id)
      .is('ended_at', null)
      .maybeSingle()
    if (timer) {
      const elapsed = Math.floor((Date.now() - new Date(timer.started_at).getTime()) / 1000)
      const remaining = Math.max(0, timer.duration_seconds - elapsed)
      timerPayload = {
        id: timer.id,
        label: timer.label || 'Timer',
        duration_seconds: timer.duration_seconds,
        started_at: timer.started_at,
        remaining_seconds: remaining,
        show_on_broadcast: timer.show_on_broadcast,
      }
    }
  }

  base.broadcast = {
    overlay_visible: state?.overlay_visible ?? true,
    mode: state?.mode ?? 'normal',
    mode_message: state?.mode_message ?? null,
    mode_started_at: state?.mode_started_at ?? null,
    mode_duration_seconds: state?.mode_duration_seconds ?? null,
    current_item: currentItem,
    timer: timerPayload,
  }

  const { data: previewItems } = await service
    .from('board_meeting_agenda_items')
    .select('item_number, title')
    .eq('board_meeting_id', bm.id)
    .eq('is_broadcastable', true)
    .order('sort_order', { ascending: true })
    .limit(12)

  base.agenda_preview = previewItems || []

  return base
}
