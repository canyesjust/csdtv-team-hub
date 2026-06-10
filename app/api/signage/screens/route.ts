import { NextRequest, NextResponse } from 'next/server'
import { requireManagerApi } from '@/lib/signage/server-auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const { service } = auth
  const body = await request.json()
  const { data, error } = await service.from('signage_screens').insert({
    code: body.code,
    name: body.name,
    area_id: body.area_id || null,
    building: body.building || null,
    floor: body.floor ?? null,
    orientation: body.orientation || 'landscape',
    layout: body.layout || 'zoned',
    wayfinding_heading: body.wayfinding_heading || null,
    accepts_takeover: body.accepts_takeover ?? true,
    active: body.active ?? true,
    notes: body.notes || null,
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ screen: data })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const { service } = auth
  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data, error } = await service.from('signage_screens').update({
    code: body.code,
    name: body.name,
    area_id: body.area_id,
    building: body.building,
    floor: body.floor,
    orientation: body.orientation,
    layout: body.layout,
    wayfinding_heading: body.wayfinding_heading,
    accepts_takeover: body.accepts_takeover,
    active: body.active,
    notes: body.notes,
  }).eq('id', body.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ screen: data })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const { service } = auth
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await service.from('signage_screens').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
