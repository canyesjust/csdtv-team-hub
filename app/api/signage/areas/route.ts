import { NextRequest, NextResponse } from 'next/server'
import { requireSignageEditorApi } from '@/lib/signage/server-auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { service } = auth
  const body = await request.json()
  const { data, error } = await service.from('signage_areas').insert({
    name: body.name,
    site_id: body.site_id || null,
    building: body.building || null,
    floor: body.floor ?? null,
    slug: body.slug,
    sort_order: body.sort_order ?? 0,
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ area: data })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { service } = auth
  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data, error } = await service.from('signage_areas').update({
    name: body.name,
    building: body.building,
    floor: body.floor,
    slug: body.slug,
    sort_order: body.sort_order,
  }).eq('id', body.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ area: data })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { service } = auth
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await service.from('signage_areas').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
