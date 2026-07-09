import { NextRequest, NextResponse } from 'next/server'
import { requireManagerApi } from '@/lib/signage/server-auth'
import { getSiteTemplate, siteAreaSlug } from '@/lib/signage/site-templates'
import { SITE_COLUMNS } from '../route'

export const dynamic = 'force-dynamic'

function slugify(s: string): string {
  return (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const ALLOWED_THEMES = ['primary', 'secondary', 'special', 'spectrum']

/**
 * One-call provisioning for a new school signage site:
 *   1. create the site (optionally with brand colors / AbleSign creds),
 *   2. seed default areas from a template (site-prefixed, globally-unique slugs),
 *   3. optionally grant site access to a set of team members.
 * Rolls back the site if area seeding fails so we never leave a half-built site.
 */
export async function POST(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const { service } = auth
  const body = await request.json().catch(() => ({})) as Record<string, unknown>

  const name = String(body.name || '').trim()
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const slug = slugify(String(body.slug || '') || name)
  if (!slug) return NextResponse.json({ error: 'A valid slug is required' }, { status: 400 })

  // Reject duplicate slugs up front for a clean error message.
  const { data: existing } = await service.from('signage_sites').select('id').eq('slug', slug).maybeSingle()
  if (existing) return NextResponse.json({ error: `A site with slug "${slug}" already exists` }, { status: 409 })

  const theme = String(body.default_theme || 'primary')
  const useBrand = Boolean(body.use_brand_colors)

  const siteInsert = {
    name,
    slug,
    school_code: body.school_code ? String(body.school_code) : null,
    use_brand_colors: useBrand,
    center_name: String(body.center_name || 'Canyons School District'),
    default_theme: ALLOWED_THEMES.includes(theme) ? theme : 'primary',
    weather_lat: typeof body.weather_lat === 'number' ? body.weather_lat : 40.5649,
    weather_lon: typeof body.weather_lon === 'number' ? body.weather_lon : -111.8389,
    ticker_extra: body.ticker_extra ? String(body.ticker_extra) : null,
    bg_color: useBrand && body.bg_color ? String(body.bg_color) : null,
    panel_color: useBrand && body.panel_color ? String(body.panel_color) : null,
    accent_color: useBrand && body.accent_color ? String(body.accent_color) : null,
    text_color: useBrand && body.text_color ? String(body.text_color) : null,
    ablesign_workspace_id: body.ablesign_workspace_id ? String(body.ablesign_workspace_id) : null,
    ablesign_api_key: body.ablesign_api_key ? String(body.ablesign_api_key) : null,
    logo_url: body.logo_url ? String(body.logo_url) : null,
    sort_order: typeof body.sort_order === 'number' ? body.sort_order : 100,
    active: body.active === false ? false : true,
  }

  const { data: site, error: siteErr } = await service
    .from('signage_sites')
    .insert(siteInsert)
    .select(SITE_COLUMNS)
    .single()
  if (siteErr || !site) {
    return NextResponse.json({ error: siteErr?.message || 'Failed to create site' }, { status: 400 })
  }

  // Seed areas from the chosen template.
  const template = getSiteTemplate(String(body.template_key || ''))
  let areasCreated = 0
  if (template.areas.length) {
    const areaRows = template.areas.map((a, i) => ({
      name: a.name,
      slug: siteAreaSlug(slug, a.slug),
      site_id: site.id,
      sort_order: (i + 1) * 10,
    }))
    const { data: areas, error: areaErr } = await service
      .from('signage_areas')
      .insert(areaRows)
      .select('id')
    if (areaErr) {
      // Roll back the site so we don't leave a half-provisioned location.
      await service.from('signage_sites').delete().eq('id', site.id)
      return NextResponse.json({ error: `Site created but seeding areas failed: ${areaErr.message}` }, { status: 400 })
    }
    areasCreated = areas?.length || 0
  }

  // Optionally grant site access to specific team members.
  const grantIds = Array.isArray(body.grant_team_ids)
    ? (body.grant_team_ids as unknown[]).map(String).filter(Boolean)
    : []
  let accessGranted = 0
  if (grantIds.length) {
    const accessRows = grantIds.map(team_id => ({ team_id, site_id: site.id }))
    const { error: accessErr } = await service
      .from('signage_site_access')
      .upsert(accessRows, { onConflict: 'team_id,site_id', ignoreDuplicates: true })
    if (!accessErr) accessGranted = grantIds.length
  }

  return NextResponse.json({ site, areasCreated, accessGranted })
}
