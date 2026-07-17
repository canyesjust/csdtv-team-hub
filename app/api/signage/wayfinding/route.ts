import { NextRequest, NextResponse } from 'next/server'
import {
  assertCanAccessSignageSite,
  loadSignageRowSiteId,
  requireSignageEditorApi,
} from '@/lib/signage/server-auth'
import { markScreensDirty } from '@/lib/signage/ablesign-helpers'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { user, service } = auth
  const body = await request.json()
  let siteId: string | null = body.site_id || null
  if (!siteId && body.area_id) {
    siteId = (await loadSignageRowSiteId(service, 'signage_areas', String(body.area_id))) ?? null
  }
  const siteCheck = await assertCanAccessSignageSite(service, user, siteId)
  if ('error' in siteCheck) return siteCheck.error
  const { data, error } = await service.from('signage_wayfinding').insert({
    area_id: body.area_id,
    site_id: siteId,
    destination: body.destination,
    direction: body.direction,
    sort_order: body.sort_order ?? 0,
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  await markScreensDirty(service, data.area_id ? { areaId: data.area_id } : { all: true })
  return NextResponse.json({ entry: data })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { user, service } = auth
  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const siteId = await loadSignageRowSiteId(service, 'signage_wayfinding', body.id)
  const siteCheck = await assertCanAccessSignageSite(service, user, siteId)
  if ('error' in siteCheck) return siteCheck.error
  const { data, error } = await service.from('signage_wayfinding').update({
    area_id: body.area_id,
    destination: body.destination,
    direction: body.direction,
    sort_order: body.sort_order,
  }).eq('id', body.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  await markScreensDirty(service, data.area_id ? { areaId: data.area_id } : { all: true })
  return NextResponse.json({ entry: data })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { user, service } = auth
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const siteId = await loadSignageRowSiteId(service, 'signage_wayfinding', id)
  const siteCheck = await assertCanAccessSignageSite(service, user, siteId)
  if ('error' in siteCheck) return siteCheck.error
  const { error } = await service.from('signage_wayfinding').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  await markScreensDirty(service, siteId ? { siteId } : { all: true })
  return NextResponse.json({ success: true })
}
