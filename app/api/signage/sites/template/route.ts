import { NextRequest, NextResponse } from 'next/server'
import { requireManagerApi } from '@/lib/signage/server-auth'

export const dynamic = 'force-dynamic'

const LAYOUTS = ['full_bleed', 'zoned', 'wayfinding']

// POST { site_id, default_layout, show_*, brand_title, brand_subtitle, logo_url }
// Updates only the template columns for a site (leaves name/colors/etc. alone).
export async function POST(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const siteId = body.site_id ? String(body.site_id) : ''
  if (!siteId) return NextResponse.json({ error: 'site_id required' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (body.default_layout !== undefined) {
    update.default_layout = LAYOUTS.includes(String(body.default_layout)) ? body.default_layout : 'zoned'
  }
  if (body.show_weather !== undefined) update.show_weather = Boolean(body.show_weather)
  if (body.show_clock !== undefined) update.show_clock = Boolean(body.show_clock)
  if (body.show_ticker !== undefined) update.show_ticker = Boolean(body.show_ticker)
  if (body.show_visitor_welcome !== undefined) update.show_visitor_welcome = Boolean(body.show_visitor_welcome)
  if (body.brand_title !== undefined) update.brand_title = body.brand_title || null
  if (body.brand_subtitle !== undefined) update.brand_subtitle = body.brand_subtitle || null
  if (body.logo_url !== undefined) update.logo_url = body.logo_url || null

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No template fields provided' }, { status: 400 })
  }

  const { data, error } = await auth.service
    .from('signage_sites')
    .update(update)
    .eq('id', siteId)
    .select('id, default_layout, show_weather, show_clock, show_ticker, show_visitor_welcome, brand_title, brand_subtitle, logo_url')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ site: data })
}
