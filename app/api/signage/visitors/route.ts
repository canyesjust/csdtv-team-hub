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
  const siteCheck = await assertCanAccessSignageSite(service, user, body.site_id || null)
  if ('error' in siteCheck) return siteCheck.error
  const { data, error } = await service.from('signage_visitors').insert({
    name: body.name,
    site_id: body.site_id || null,
    note: body.note || null,
    visit_date: body.visit_date,
    active: body.active ?? true,
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  await markScreensDirty(service, data.site_id ? { siteId: data.site_id } : { all: true })
  return NextResponse.json({ visitor: data })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { user, service } = auth
  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const siteId = await loadSignageRowSiteId(service, 'signage_visitors', body.id)
  const siteCheck = await assertCanAccessSignageSite(service, user, siteId)
  if ('error' in siteCheck) return siteCheck.error
  const { data, error } = await service.from('signage_visitors').update({
    name: body.name,
    note: body.note,
    visit_date: body.visit_date,
    active: body.active,
    ...(typeof body.pending === 'boolean' ? { pending: body.pending } : {}),
  }).eq('id', body.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  await markScreensDirty(service, data.site_id ? { siteId: data.site_id } : { all: true })
  return NextResponse.json({ visitor: data })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { user, service } = auth
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const siteId = await loadSignageRowSiteId(service, 'signage_visitors', id)
  const siteCheck = await assertCanAccessSignageSite(service, user, siteId)
  if ('error' in siteCheck) return siteCheck.error
  const { error } = await service.from('signage_visitors').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  await markScreensDirty(service, siteId ? { siteId } : { all: true })
  return NextResponse.json({ success: true })
}
