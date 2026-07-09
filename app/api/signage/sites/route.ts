import { NextRequest, NextResponse } from 'next/server'
import { requireManagerApi } from '@/lib/signage/server-auth'

export const dynamic = 'force-dynamic'

const LAYOUTS = ['full_bleed', 'zoned', 'zoned2', 'wayfinding']

// Non-secret column list returned to the manager's browser. Deliberately EXCLUDES
// the secret columns `ablesign_api_key` and `ablesign_workspace_id` so API
// responses never ship AbleSign credentials to the client.
// Written as a single string literal (not a concatenation) and `as const` so
// supabase-js can infer the row shape at the type level. A widened `string`
// breaks column type inference (site.id becomes unknown).
export const SITE_COLUMNS =
  'id, name, slug, school_code, use_brand_colors, center_name, weather_lat, weather_lon, ticker_extra, default_theme, default_layout, bg_color, panel_color, accent_color, text_color, logo_url, sort_order, active, show_weather, show_clock, show_ticker, show_visitor_welcome, brand_title, brand_subtitle' as const

function siteFields(body: Record<string, unknown>) {
  const theme = body.default_theme
  const layout = body.default_layout
  const fields: Record<string, unknown> = {
    name: body.name,
    slug: body.slug,
    school_code: body.school_code || null,
    use_brand_colors: body.use_brand_colors ?? false,
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
  // Template fields are optional — only included when present so a plain site
  // edit doesn't clobber template settings managed on the Template page.
  // Secret: only written when explicitly present so a plain site edit (whose
  // browser form no longer reads/sends this locked-down column) never clobbers it.
  if (body.ablesign_workspace_id !== undefined) fields.ablesign_workspace_id = body.ablesign_workspace_id || null
  if (layout !== undefined) fields.default_layout = LAYOUTS.includes(String(layout)) ? layout : 'zoned'
  if (body.show_weather !== undefined) fields.show_weather = Boolean(body.show_weather)
  if (body.show_clock !== undefined) fields.show_clock = Boolean(body.show_clock)
  if (body.show_ticker !== undefined) fields.show_ticker = Boolean(body.show_ticker)
  if (body.show_visitor_welcome !== undefined) fields.show_visitor_welcome = Boolean(body.show_visitor_welcome)
  if (body.brand_title !== undefined) fields.brand_title = body.brand_title || null
  if (body.brand_subtitle !== undefined) fields.brand_subtitle = body.brand_subtitle || null
  return fields
}

export async function POST(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const body = await request.json()
  const { data, error } = await auth.service.from('signage_sites').insert(siteFields(body)).select(SITE_COLUMNS).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ site: data })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data, error } = await auth.service.from('signage_sites').update(siteFields(body)).eq('id', body.id).select(SITE_COLUMNS).single()
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
