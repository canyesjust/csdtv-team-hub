import { NextRequest, NextResponse } from 'next/server'
import { requireManagerApi } from '@/lib/signage/server-auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const { service } = auth
  const body = await request.json()
  const { data, error } = await service.from('signage_wayfinding').insert({
    area_id: body.area_id,
    destination: body.destination,
    direction: body.direction,
    sort_order: body.sort_order ?? 0,
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ entry: data })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const { service } = auth
  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data, error } = await service.from('signage_wayfinding').update({
    area_id: body.area_id,
    destination: body.destination,
    direction: body.direction,
    sort_order: body.sort_order,
  }).eq('id', body.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ entry: data })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const { service } = auth
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await service.from('signage_wayfinding').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
