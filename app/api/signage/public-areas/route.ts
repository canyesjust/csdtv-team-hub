import { NextRequest, NextResponse } from 'next/server'
import { SIGNAGE_AREAS_CACHE_HEADERS } from '@/lib/signage/public-api-cache'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

// Public: areas + how many active screens each has, for the submission form.
// Optional `?site=<slug>` scopes the response to a single location and returns
// that site's display info so the per-site form can name/brand itself.
export async function GET(request: NextRequest) {
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ site: null, areas: [] })

  const slug = (new URL(request.url).searchParams.get('site') || '').trim().toLowerCase()

  // Resolve the site first when scoped, so we can filter areas and 404 cleanly.
  let site: { id: string; name: string; slug: string; center_name: string } | null = null
  if (slug) {
    const { data } = await service
      .from('signage_sites')
      .select('id, name, slug, center_name, active')
      .eq('slug', slug)
      .maybeSingle()
    if (!data || data.active === false) {
      return NextResponse.json({ site: null, areas: [] }, { status: 404 })
    }
    site = { id: data.id, name: data.name, slug: data.slug, center_name: data.center_name }
  }

  const areaQuery = service.from('signage_areas').select('id, name, site_id, signage_sites(name)').order('sort_order')
  if (site) areaQuery.eq('site_id', site.id)

  const [areaRes, screenRes] = await Promise.all([
    areaQuery,
    service.from('signage_screens').select('area_id').eq('active', true),
  ])

  const counts = new Map<string, number>()
  for (const s of screenRes.data || []) {
    if (s.area_id) counts.set(s.area_id, (counts.get(s.area_id) || 0) + 1)
  }

  const areas = (areaRes.data || []).map(a => {
    const s = a.signage_sites as { name: string } | { name: string }[] | null
    const siteName = Array.isArray(s) ? s[0]?.name : s?.name
    return { id: a.id, name: a.name, site_name: siteName || null, screen_count: counts.get(a.id) || 0 }
  })

  return NextResponse.json({ site, areas }, { headers: SIGNAGE_AREAS_CACHE_HEADERS })
}
