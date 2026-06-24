/**
 * Refresh AbleSign online status for linked Hub screens.
 * Scheduled via Supabase pg_cron (see db/ablesign_health_cron.sql), not Vercel Cron —
 * Hobby plan blocks deployments when vercel.json defines crons.
 */
import { NextRequest, NextResponse } from 'next/server'
import { AbleSignApiError, listAllScreens, type AbleSignScreen } from '@/lib/server/ablesign'
import { deriveAbleSignOnline, writeAbleSignLog } from '@/lib/signage/ablesign-helpers'
import { getSiteAbleSignCreds } from '@/lib/signage/ablesign-creds'
import { verifySignageCron } from '@/lib/signage/ablesign-cron'
import { requireManagerApi } from '@/lib/signage/server-auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

// Each site can point at its own AbleSign workspace, so we fetch the remote
// screen list once per distinct site and match heartbeats within that site.
const DEFAULT_SITE_KEY = '__default__'

async function refreshAbleSignHealth() {
  const service = getServiceSupabaseClient()
  if (!service) {
    return { error: 'Server configuration error', status: 500 as const }
  }

  const { data: hubScreens, error: hubError } = await service
    .from('signage_screens')
    .select('id, name, ablesign_screen_id, site_id')
    .not('ablesign_screen_id', 'is', null)

  if (hubError) {
    return { error: hubError.message, status: 500 as const }
  }

  // Group linked screens by site, then fetch each site's workspace once.
  const siteKeys = new Set<string>((hubScreens ?? []).map(h => h.site_id || DEFAULT_SITE_KEY))
  const remoteBySite = new Map<string, Map<number, AbleSignScreen>>()
  for (const key of siteKeys) {
    const creds = key === DEFAULT_SITE_KEY ? {} : await getSiteAbleSignCreds(service, key)
    try {
      const screens = await listAllScreens(creds)
      remoteBySite.set(key, new Map(screens.map(s => [s.id, s])))
    } catch {
      // A misconfigured site shouldn't block the rest; treat its screens as offline.
      remoteBySite.set(key, new Map())
    }
  }

  const updates: Array<{
    id: string
    ablesign_online: boolean
    ablesign_heartbeat_at: string | null
  }> = []

  for (const hub of hubScreens ?? []) {
    const byAbleSignId = remoteBySite.get(hub.site_id || DEFAULT_SITE_KEY)
    const remote = byAbleSignId?.get(Number(hub.ablesign_screen_id))
    const heartbeat = remote?.heartbeatTime ?? null
    const online = remote
      ? deriveAbleSignOnline(heartbeat, remote.onlineStatus)
      : false

    updates.push({
      id: hub.id,
      ablesign_online: online,
      ablesign_heartbeat_at: heartbeat,
    })

    await service
      .from('signage_screens')
      .update({
        ablesign_online: online,
        ablesign_heartbeat_at: heartbeat,
      })
      .eq('id', hub.id)
  }

  await writeAbleSignLog(service, {
    screen_id: null,
    action: 'health',
    status: 'ok',
    detail: `Updated ${updates.length} linked screen(s)`,
  })

  return {
    ok: true as const,
    updated: updates.length,
    screens: updates,
  }
}

export async function GET(request: NextRequest) {
  const isCron = verifySignageCron(request)
  if (!isCron) {
    const auth = await requireManagerApi()
    if ('error' in auth) return auth.error
  }

  try {
    const result = await refreshAbleSignHealth()
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof AbleSignApiError
      ? err.message
      : err instanceof Error
        ? err.message
        : 'Health refresh failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
