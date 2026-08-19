import { NextRequest, NextResponse } from 'next/server'
import {
  assertCanAccessSignageScreen,
  assertCanEditScreenFields,
  assertCanManageSignageSite,
  loadSignageRowSiteId,
  requireSignageEditorApi,
} from '@/lib/signage/server-auth'

export const dynamic = 'force-dynamic'

// 'webpage' layout screens store one external URL. Only accept a bounded
// http(s) URL; anything else (javascript:, data:, junk, over-long) becomes null.
function sanitizeWebpageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > 2048) return null
  try {
    const u = new URL(trimmed)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { user, service } = auth
  const body = await request.json()
  // Creating a screen is a site-level act — screen-scoped editors can't. A new
  // screen must name its location, or it lands outside every access policy.
  if (!body.site_id) return NextResponse.json({ error: 'site_id required' }, { status: 400 })
  const siteCheck = await assertCanManageSignageSite(service, user, body.site_id)
  if ('error' in siteCheck) return siteCheck.error
  const { data, error } = await service.from('signage_screens').insert({
    code: body.code,
    name: body.name,
    area_id: body.area_id || null,
    building: body.building || null,
    floor: body.floor ?? null,
    orientation: body.orientation || 'landscape',
    layout: body.layout || 'zoned',
    theme: body.theme || null,
    site_id: body.site_id || null,
    wayfinding_heading: body.wayfinding_heading || null,
    webpage_url: sanitizeWebpageUrl(body.webpage_url),
    accepts_takeover: body.accepts_takeover ?? true,
    board_takeover_enabled: body.board_takeover_enabled ?? false,
    board_takeover_audio: body.board_takeover_audio ?? false,
    active: body.active ?? true,
    notes: body.notes || null,
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ screen: data })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { user, service } = auth
  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  // Editing a screen's own settings is allowed for whoever holds that screen,
  // but a screen-scoped editor only gets the presentation fields — not the
  // placement or takeover opt-ins.
  const screenCheck = await assertCanAccessSignageScreen(service, user, body.id)
  if ('error' in screenCheck) return screenCheck.error
  const fieldCheck = await assertCanEditScreenFields(service, user, body.id, Object.keys(body))
  if ('error' in fieldCheck) return fieldCheck.error

  // Build the patch from what was actually sent. `theme` and `webpage_url` used
  // to be written unconditionally, so a partial PATCH silently wiped them —
  // which matters now that screen-scoped editors send narrow bodies.
  const patch: Record<string, unknown> = {}
  const copy = (key: string) => { if (key in body) patch[key] = body[key] }
  ;[
    'code', 'name', 'area_id', 'building', 'floor', 'orientation', 'layout',
    'wayfinding_heading', 'accepts_takeover', 'board_takeover_enabled',
    'board_takeover_audio', 'active', 'notes',
  ].forEach(copy)
  if ('theme' in body) patch.theme = body.theme ?? null
  if ('webpage_url' in body) patch.webpage_url = sanitizeWebpageUrl(body.webpage_url)

  const { data, error } = await service.from('signage_screens').update(patch).eq('id', body.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ screen: data })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { user, service } = auth
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  // Deleting a screen is a site-level act — screen-scoped editors can't.
  const siteId = await loadSignageRowSiteId(service, 'signage_screens', id)
  const siteCheck = await assertCanManageSignageSite(service, user, siteId)
  if ('error' in siteCheck) return siteCheck.error
  const { error } = await service.from('signage_screens').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
