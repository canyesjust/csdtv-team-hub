import { NextResponse } from 'next/server'
import { SIGNAGE_AREAS_CACHE_HEADERS } from '@/lib/signage/public-api-cache'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

// Public: areas + how many active screens each has, for the submission form.
export async function GET() {
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ areas: [] })

  const [areaRes, screenRes] = await Promise.all([
    service.from('signage_areas').select('id, name, signage_sites(name)').order('sort_order'),
    service.from('signage_screens').select('area_id').eq('active', true),
  ])

  const counts = new Map<string, number>()
  for (const s of screenRes.data || []) {
    if (s.area_id) counts.set(s.area_id, (counts.get(s.area_id) || 0) + 1)
  }

  const areas = (areaRes.data || []).map(a => {
    const site = a.signage_sites as { name: string } | { name: string }[] | null
    const siteName = Array.isArray(site) ? site[0]?.name : site?.name
    return { id: a.id, name: a.name, site_name: siteName || null, screen_count: counts.get(a.id) || 0 }
  })

  return NextResponse.json({ areas }, { headers: SIGNAGE_AREAS_CACHE_HEADERS })
}
