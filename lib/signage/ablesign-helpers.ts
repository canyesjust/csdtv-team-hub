import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createHtmlWebApp,
  createWebApp,
  deleteWebApp,
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

export type HubHtmlScreenRow = {
  id: string
  code: string
  name: string
  ablesign_screen_id: number | null
  ablesign_html_webapp_id: number | null
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

/**
 * Mark AbleSign-linked screens as needing an HTML re-push. Called from the
 * signage content-save routes after a successful write. The dirty-flush cron
 * picks these up, regenerates the HTML, and (if the content actually changed)
 * re-pushes the web app. Coarse targeting (whole site / area) is fine — an
 * unnecessary regenerate is cheap and the hash-skip drops no-op pushes.
 *
 * Only linked screens (ablesign_screen_id set) are marked; unlinked screens have
 * no AbleSign target. Best-effort: never throws into the save path.
 */
export async function markScreensDirty(
  service: SupabaseClient,
  scope: { siteId?: string | null; areaId?: string | null; screenIds?: string[]; all?: boolean },
): Promise<void> {
  try {
    const now = new Date().toISOString()
    let query = service
      .from('signage_screens')
      .update({ ablesign_html_dirty_at: now })
      .not('ablesign_screen_id', 'is', null)

    if (scope.screenIds?.length) {
      query = query.in('id', scope.screenIds)
    } else if (scope.areaId) {
      query = query.eq('area_id', scope.areaId)
    } else if (scope.siteId) {
      query = query.eq('site_id', scope.siteId)
    } else if (!scope.all) {
      // No scope and not explicitly "all" — do nothing rather than mark everything.
      return
    }

    await query
  } catch {
    // Marking dirty must never break a content save.
  }
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

/**
 * Point a screen's AbleSign playlist at a URL web app for an ARBITRARY url —
 * used by webpage-layout screens to show a live external site directly. The
 * kiosk browser loads it natively (no baked HTML, no iframe framing limits).
 */
export async function syncScreenToUrl(
  service: SupabaseClient,
  screen: { id: string; name: string; ablesign_screen_id: number; ablesign_webapp_id: number | null },
  url: string,
  creds?: AbleSignCreds,
): Promise<{ webappId: number }> {
  let webappId = screen.ablesign_webapp_id
  if (webappId) {
    await updateWebApp(webappId, { url, zoom: 100 }, creds)
  } else {
    const created = await createWebApp({ title: screen.name, url }, creds)
    webappId = created.id
    await updateWebApp(webappId, { zoom: 100 }, creds)
    await service.from('signage_screens').update({ ablesign_webapp_id: webappId }).eq('id', screen.id)
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

/**
 * Push a self-contained HTML document to AbleSign as an HTML-type web app and
 * point the screen's playlist at it. Because the AbleSign API cannot mutate the
 * `html` of an existing web app, every push CREATES a new HTML web app,
 * re-points the playlist, persists the new id, then best-effort deletes the
 * previous HTML web app. The stick downloads the new web app and plays it from
 * local storage — so the screen survives a network outage between pushes.
 *
 * Caller supplies the rendered `html` (from buildScreenHtml) so this helper has
 * no dependency on the render pipeline.
 */
export async function pushScreenHtmlWebApp(
  service: SupabaseClient,
  screen: HubHtmlScreenRow,
  html: string,
  creds?: AbleSignCreds,
): Promise<{ webappId: number; bytes: number; replacedOldId: number | null }> {
  if (!screen.ablesign_screen_id) {
    throw new Error('Link this screen to AbleSign before pushing HTML')
  }

  const bytes = Buffer.byteLength(html, 'utf8')

  // Create a fresh HTML web app (the API can't change html on an existing one).
  const created = await createHtmlWebApp({ title: `${screen.name} (HTML)`, html }, creds)
  const newId = created.id

  // Match the kiosk zoom used by the URL web app path.
  await updateWebApp(newId, { zoom: 100 }, creds)

  // Re-point the screen's playlist to the new HTML web app.
  await saveScreenPlaylist(screen.ablesign_screen_id, {
    items: [{ webAppId: newId, sequenceNumber: 0, displayDuration: 86400 }],
    shufflePlay: false,
    enableWebappTransitions: false,
    enableImageTransitions: false,
  }, creds)

  // Persist the new id BEFORE cleanup so a delete failure can't orphan the link.
  await service
    .from('signage_screens')
    .update({
      ablesign_html_webapp_id: newId,
      ablesign_synced_at: new Date().toISOString(),
    })
    .eq('id', screen.id)

  // Best-effort delete of the previous HTML web app to avoid orphan buildup.
  const oldId = screen.ablesign_html_webapp_id
  let replacedOldId: number | null = null
  if (oldId && oldId !== newId) {
    try {
      await deleteWebApp(oldId, creds)
      replacedOldId = oldId
    } catch {
      // Leave the orphan; cleanup is not fatal to the push.
    }
  }

  return { webappId: newId, bytes, replacedOldId }
}
