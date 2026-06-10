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
    all_screens: body.all_screens ?? (
      !(body.target_area_ids?.length) && !(body.target_screen_ids?.length)
    ),
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

  const patch: Record<string, unknown> = {}
  if (typeof body.title === 'string') patch.title = body.title
  if (body.subtitle === null || typeof body.subtitle === 'string') patch.subtitle = body.subtitle
  if (typeof body.all_screens === 'boolean') patch.all_screens = body.all_screens
  if (Array.isArray(body.target_area_ids)) patch.target_area_ids = body.target_area_ids
  if (Array.isArray(body.target_screen_ids)) patch.target_screen_ids = body.target_screen_ids
  if (typeof body.start_date === 'string') patch.start_date = body.start_date
  if (typeof body.end_date === 'string') patch.end_date = body.end_date
  if (typeof body.priority === 'number') patch.priority = body.priority
  if (typeof body.in_ticker === 'boolean') patch.in_ticker = body.in_ticker
  if (typeof body.active === 'boolean') patch.active = body.active

  const { data, error } = await service.from('signage_announcements').update(patch).eq('id', body.id).select('*').single()
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
