import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import {
  buildPublicChannelLivePatch,
  type PublicChannelLivePatch,
} from '@/lib/board-meetings/public-output-live'
import { loadAgendaItemExtras } from '@/lib/board-meetings/public-output-state'

/** Broadcast event name — OBS / overlay / dais clients listen for this. */
export const BOARD_OUTPUT_BROADCAST_EVENT = 'refresh'

export type BoardOutputBroadcastPayload = {
  ts: number
  patch: PublicChannelLivePatch | null
}

export function boardOutputTopic(channelNumber: number): string {
  return `board-output:${channelNumber}`
}

async function resolveAssignedChannelNumbers(
  service: SupabaseClient,
  boardMeetingId: string,
): Promise<number[]> {
  const { data: rows, error } = await service
    .from('channel_assignments')
    .select('output_channel_id')
    .eq('board_meeting_id', boardMeetingId)
    .is('unassigned_at', null)

  if (error || !rows?.length) return []

  const ids = rows.map(r => r.output_channel_id).filter(Boolean)
  if (!ids.length) return []

  const { data: channels } = await service
    .from('output_channels')
    .select('channel_number')
    .in('id', ids)

  return (channels || [])
    .map(c => c.channel_number)
    .filter((n): n is number => typeof n === 'number' && n > 0)
}

async function enrichLivePatch(
  service: SupabaseClient,
  patch: PublicChannelLivePatch,
): Promise<PublicChannelLivePatch> {
  if (!patch.current_item?.id) return patch
  const extras = await loadAgendaItemExtras(service, patch.current_item.id)
  return {
    ...patch,
    current_item: { ...patch.current_item, ...extras },
  }
}

async function sendBoardOutputBroadcastHttp(
  channelNumber: number,
  payload: BoardOutputBroadcastPayload,
): Promise<boolean> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!baseUrl || !key) return false

  try {
    const res = await fetch(`${baseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: boardOutputTopic(channelNumber),
            event: BOARD_OUTPUT_BROADCAST_EVENT,
            payload,
            private: false,
          },
        ],
      }),
    })
    return res.status === 202 || res.ok
  } catch {
    return false
  }
}

async function sendBoardOutputBroadcast(
  channelNumber: number,
  payload: BoardOutputBroadcastPayload,
): Promise<boolean> {
  const supabase = getServiceSupabaseClient()
  if (!supabase) return sendBoardOutputBroadcastHttp(channelNumber, payload)

  const channel = supabase.channel(boardOutputTopic(channelNumber))
  try {
    const result = await channel.httpSend(BOARD_OUTPUT_BROADCAST_EVENT, payload)
    return result.success
  } catch {
    return sendBoardOutputBroadcastHttp(channelNumber, payload)
  }
}

export async function notifyBoardOutputChannel(
  service: SupabaseClient,
  channelNumber: number,
): Promise<void> {
  const rawPatch = await buildPublicChannelLivePatch(service, channelNumber)
  const patch = rawPatch ? await enrichLivePatch(service, rawPatch) : null
  const payload: BoardOutputBroadcastPayload = { ts: Date.now(), patch }

  await sendBoardOutputBroadcast(channelNumber, payload)
}

/** Push fresh state to every output channel assigned to this meeting. */
export async function notifyBoardOutputsForMeeting(
  service: SupabaseClient,
  boardMeetingId: string,
): Promise<void> {
  const numbers = await resolveAssignedChannelNumbers(service, boardMeetingId)
  if (!numbers.length) return
  await Promise.all(numbers.map(n => notifyBoardOutputChannel(service, n)))
}
