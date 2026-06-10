import { NextRequest, NextResponse } from 'next/server'
import { requireManagerApi } from '@/lib/signage/server-auth'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const { service } = auth

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.is_live === 'boolean') patch.is_live = body.is_live
  if (body.hls_url === null || typeof body.hls_url === 'string') patch.hls_url = body.hls_url
  if (body.label === null || typeof body.label === 'string') patch.label = body.label
  if (typeof body.all_screens === 'boolean') patch.all_screens = body.all_screens
  if (Array.isArray(body.target_area_ids)) patch.target_area_ids = body.target_area_ids
  if (Array.isArray(body.target_screen_ids)) patch.target_screen_ids = body.target_screen_ids

  const { data, error } = await service
    .from('signage_live')
    .update(patch)
    .eq('id', 1)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ live: data })
}

export async function GET() {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const { service } = auth

  const { data, error } = await service.from('signage_live').select('*').eq('id', 1).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ live: data })
}
