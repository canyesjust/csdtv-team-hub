import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createWebApp,
  saveScreenPlaylist,
  updateWebApp,
  type AbleSignCreds,
  type AbleSignOrientation,
} from '@/lib/server/ablesign'
import { signageScreenPublicUrl } from '@/lib/signage/constants'

export const ABLESIGN_HEARTBEAT_STALE_MS = 5 * 60 * 1000

export type HubScreenRow = {
  id: string
  code: string
  name: string
  orientation: string
  ablesign_screen_id: number | null
  ablesign_webapp_id: number | null
}

export function hubOrientationToAbleSign(orientation: string): AbleSignOrientation {
  return orientation === 'portrait' ? 'portrait' : 'landscape'
}

export function isHeartbeatStale(heartbeatTime: string | null | undefined, now = Date.now()): boolean {
  if (!heartbeatTime) return true
  const ts = Date.parse(heartbeatTime)
  if (Number.isNaN(ts)) return true
  return now - ts > ABLESIGN_HEARTBEAT_STALE_MS
}

export function deriveAbleSignOnline(
  heartbeatTime: string | null | undefined,
  onlineStatus?: string | null,
): boolean {
  if (onlineStatus === 'offline') return false
  if (onlineStatus === 'online' && !isHeartbeatStale(heartbeatTime)) return true
  return !isHeartbeatStale(heartbeatTime)
}

export async function writeAbleSignLog(
  service: SupabaseClient,
  row: {
    screen_id: string | null
    action: string
    status: 'ok' | 'error'
    detail?: string | null
  },
) {
  await service.from('signage_ablesign_log').insert({
    screen_id: row.screen_id,
    action: row.action,
    status: row.status,
    detail: row.detail || null,
  })
}

export async function syncHubScreenToAbleSign(
  service: SupabaseClient,
  screen: HubScreenRow,
  creds?: AbleSignCreds,
): Promise<{ webappId: number }> {
  if (!screen.ablesign_screen_id) {
    throw new Error('Link this screen to AbleSign before syncing')
  }

  const url = signageScreenPublicUrl(screen.code)

  let webappId = screen.ablesign_webapp_id
  if (webappId) {
    await updateWebApp(webappId, { url, zoom: 100 }, creds)
  } else {
    const created = await createWebApp({ title: screen.name, url }, creds)
    webappId = created.id
    await updateWebApp(webappId, { zoom: 100 }, creds)
    await service
      .from('signage_screens')
      .update({ ablesign_webapp_id: webappId })
      .eq('id', screen.id)
  }

  await saveScreenPlaylist(screen.ablesign_screen_id, {
    items: [{ webAppId: webappId, sequenceNumber: 0, displayDuration: 86400 }],
    shufflePlay: false,
    enableWebappTransitions: false,
    enableImageTransitions: false,
  }, creds)

  await service
    .from('signage_screens')
    .update({ ablesign_synced_at: new Date().toISOString() })
    .eq('id', screen.id)

  return { webappId }
}
