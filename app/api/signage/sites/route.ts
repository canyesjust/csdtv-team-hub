import { NextRequest, NextResponse } from 'next/server'
import { requireManagerApi } from '@/lib/signage/server-auth'

export const dynamic = 'force-dynamic'

function siteFields(body: Record<string, unknown>) {
  const theme = body.default_theme
  return {
    name: body.name,
    slug: body.slug,
    school_code: body.school_code || null,
    use_brand_colors: body.use_brand_colors ?? false,
    ablesign_workspace_id: body.ablesign_workspace_id || null,
    center_name: body.center_name || 'Canyons School District',
    weather_lat: body.weather_lat ?? 40.5649,
    weather_lon: body.weather_lon ?? -111.8389,
    ticker_extra: body.ticker_extra || null,
    default_theme: theme === 'secondary' || theme === 'special' || theme === 'spectrum' ? theme : 'primary',
    bg_color: body.bg_color || null,
    panel_color: body.panel_color || null,
    accent_color: body.accent_color || null,
    text_color: body.text_color || null,
    logo_url: body.logo_url || null,
    sort_order: body.sort_order ?? 0,
    active: body.active ?? true,
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const body = await request.json()
  const { data, error } = await auth.service.from('signage_sites').insert(siteFields(body)).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ site: data })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data, error } = await auth.service.from('signage_sites').update(siteFields(body)).eq('id', body.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ site: data })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await auth.service.from('signage_sites').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
