import { NextRequest, NextResponse } from 'next/server'
import { requireManagerApi } from '@/lib/signage/server-auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const { service } = auth
  const body = await request.json()
  const { data, error } = await service.from('signage_announcements').insert({
    title: body.title,
    subtitle: body.subtitle || null,
    all_screens: body.all_screens ?? false,
    target_area_ids: body.target_area_ids ?? [],
    target_screen_ids: body.target_screen_ids ?? [],
    start_date: body.start_date,
    end_date: body.end_date,
    priority: body.priority ?? 0,
    in_ticker: body.in_ticker ?? true,
    active: body.active ?? true,
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ announcement: data })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const { service } = auth
  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data, error } = await service.from('signage_announcements').update(body).eq('id', body.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ announcement: data })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const { service } = auth
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await service.from('signage_announcements').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
