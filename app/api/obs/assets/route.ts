import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { hasObsSiteAccess } from '@/lib/server/obs-access'
import { OBS_CATEGORIES, type ObsCategory } from '@/lib/obs-assets'

// Lists OBS assets for the operator page and the dashboard manage view. Gated by the
// shared password (or a signed-in team user). Never returns storage paths or signed
// URLs — downloads go through /api/obs/assets/[id]/download.
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!(await hasObsSiteAccess())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')

  let query = service
    .from('obs_assets')
    .select('id, category, name, filename, kind, mime_type, file_size_bytes, enabled, created_at')
    .order('created_at', { ascending: false })

  if (category) {
    if (!OBS_CATEGORIES.includes(category as ObsCategory)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }
    query = query.eq('category', category)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ assets: data || [] }, { headers: { 'Cache-Control': 'no-store' } })
}
