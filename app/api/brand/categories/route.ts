import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { brandGateEnabled, hasBrandSiteAccess } from '@/lib/server/brand-access'

// Distinct logo categories in use across the whole library. Used so the reviewer sees
// the same full set of category options on every school (not just the presets plus the
// current logo's category).
export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await hasBrandSiteAccess())) {
    return NextResponse.json({ error: 'Access to the brand library is restricted.' }, { status: 401 })
  }

  const supabase = getServiceSupabaseClient()
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const categories = new Set<string>()
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('school_logos')
      .select('category')
      .order('category', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) break
    const batch = (data ?? []) as { category: string | null }[]
    for (const r of batch) {
      const c = (r.category || '').trim()
      if (c) categories.add(c)
    }
    if (batch.length < PAGE) break
  }

  // Categories change rarely; cache when the site is open.
  return NextResponse.json(
    { categories: [...categories] },
    { headers: { 'Cache-Control': (await brandGateEnabled()) ? 'private, no-store' : 'public, s-maxage=300, stale-while-revalidate=900' } },
  )
}
