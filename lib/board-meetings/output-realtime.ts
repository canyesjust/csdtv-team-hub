import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

/** Broadcast event name — OBS / overlay / dais clients listen for this. */
export const BOARD_OUTPUT_BROADCAST_EVENT = 'refresh'

export function boardOutputTopic(channelNumber: number): string {
  return `board-output:${channelNumber}`
}

export async function notifyBoardOutputChannel(channelNumber: number): Promise<void> {
  const supabase = getServiceSupabaseClient()
  if (!supabase) return

  const topic = boardOutputTopic(channelNumber)
  const channel = supabase.channel(topic)
  try {
    await channel.send({
      type: 'broadcast',
      event: BOARD_OUTPUT_BROADCAST_EVENT,
      payload: { ts: Date.now() },
    })
  } finally {
    await supabase.removeChannel(channel)
  }
}

/** Ping every output channel assigned to this meeting (overlay, dais, preroll, etc.). */
export async function notifyBoardOutputsForMeeting(
  service: SupabaseClient,
  boardMeetingId: string,
): Promise<void> {
  const { data: rows } = await service
    .from('channel_assignments')
    .select('output_channel_id, output_channels(channel_number)')
    .eq('board_meeting_id', boardMeetingId)
    .is('unassigned_at', null)

  const numbers = new Set<number>()
  for (const row of rows || []) {
    const ch = row.output_channels as { channel_number?: number } | null
    if (ch?.channel_number != null && ch.channel_number > 0) {
      numbers.add(ch.channel_number)
    }
  }

  await Promise.all([...numbers].map(n => notifyBoardOutputChannel(n)))
}
