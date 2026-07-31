import { NextRequest, NextResponse } from 'next/server'
import { normalizeSignageLiveTargeting, signageLiveMatchesScreen } from '@/lib/signage/live-targeting'
import { isSignageStreamUrl, normalizeSignageStreamUrl } from '@/lib/signage/stream-url'
import { assertCanAccessSignageSite, requireSignageEditorApi } from '@/lib/signage/server-auth'
import { pushTakeoverScreens } from '@/lib/signage/takeover-push'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// See app/api/signage/board-takeover/route.ts — same reasoning, same ceiling.
export const maxDuration = 60

type LiveRow = {
  all_screens: boolean
  target_area_ids: string[] | null
  target_screen_ids: string[] | null
}

/**
 * Screens this live row actually reaches, opted-in (accepts_takeover) and on
 * the same site. Used for both going live and going off: going off normally
 * resets targeting to all_screens (see the `row` defaults below), so this
 * naturally reverts every opted-in screen on the site, not just whichever
 * ones were targeted while it was live.
 */
async function pushToLiveTargetedScreens(service: SupabaseClient, siteId: string, liveRow: LiveRow) {
  const { data: screens } = await service
    .from('signage_screens')
    .select('id, code, area_id, building')
    .eq('active', true)
    .eq('accepts_takeover', true)
    .eq('site_id', siteId)
  const codes = (screens ?? [])
    .filter(s => signageLiveMatchesScreen(liveRow, { id: s.id, area_id: s.area_id, building: s.building }))
    .map(s => s.code)
  if (codes.length === 0) return
  await pushTakeoverScreens(service, codes)
}

export async function PATCH(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { user, service } = auth

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const siteId = typeof body.site_id === 'string' && body.site_id ? body.site_id : null
  if (!siteId) {
    return NextResponse.json({ error: 'site_id is required' }, { status: 400 })
  }
  const siteCheck = await assertCanAccessSignageSite(service, user, siteId)
  if ('error' in siteCheck) return siteCheck.error

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.is_live === 'boolean') patch.is_live = body.is_live
  if (body.hls_url === null || typeof body.hls_url === 'string') {
    patch.hls_url = body.hls_url === null ? null : normalizeSignageStreamUrl(body.hls_url)
  }
  if (body.label === null || typeof body.label === 'string') patch.label = body.label
  if (typeof body.all_screens === 'boolean') patch.all_screens = body.all_screens
  if (Array.isArray(body.target_area_ids)) patch.target_area_ids = body.target_area_ids
  if (Array.isArray(body.target_screen_ids)) patch.target_screen_ids = body.target_screen_ids

  const goingLive = patch.is_live === true
  const streamUrl = typeof patch.hls_url === 'string' ? patch.hls_url : null
  if (goingLive && (!streamUrl || !isSignageStreamUrl(streamUrl))) {
    return NextResponse.json(
      { error: 'A valid HLS (.m3u8) or YouTube live URL is required to go live.' },
      { status: 400 },
    )
  }

  const normalized = normalizeSignageLiveTargeting({
    all_screens: Boolean(patch.all_screens),
    target_area_ids: (patch.target_area_ids as string[]) ?? [],
    target_screen_ids: (patch.target_screen_ids as string[]) ?? [],
  })
  patch.all_screens = normalized.all_screens
  patch.target_area_ids = normalized.target_area_ids
  patch.target_screen_ids = normalized.target_screen_ids

  const row = {
    site_id: siteId,
    is_live: false,
    hls_url: null as string | null,
    label: null as string | null,
    all_screens: true,
    target_area_ids: [] as string[],
    target_screen_ids: [] as string[],
    updated_at: patch.updated_at as string,
    ...patch,
  }

  const { data, error } = await service
    .from('signage_live')
    .upsert(row, { onConflict: 'site_id' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await pushToLiveTargetedScreens(service, siteId, data)
  return NextResponse.json({ live: data })
}

export async function GET(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { user, service } = auth

  const siteId = new URL(request.url).searchParams.get('site_id')
  if (!siteId) return NextResponse.json({ error: 'site_id is required' }, { status: 400 })
  const siteCheck = await assertCanAccessSignageSite(service, user, siteId)
  if ('error' in siteCheck) return siteCheck.error

  const { data, error } = await service.from('signage_live').select('*').eq('site_id', siteId).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ live: data })
}
