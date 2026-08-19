import 'server-only'

/** Output pages subscribe to this topic per channel. */
export const GRAPHICS_BROADCAST_EVENT = 'gfx'
export const graphicsTopic = (channelSlug: string) => `gfx-output:${channelSlug}`

/**
 * Push is the fast path. The polling ladder underneath only catches a dropped
 * broadcast, so a missed push never shows on air.
 */
export async function broadcastGraphicsChange(channelSlug: string): Promise<boolean> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!baseUrl || !key) return false

  try {
    const res = await fetch(`${baseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        messages: [{
          topic: graphicsTopic(channelSlug),
          event: GRAPHICS_BROADCAST_EVENT,
          payload: { ts: Date.now() },
          private: false,
        }],
      }),
    })
    return res.ok
  } catch {
    return false
  }
}
