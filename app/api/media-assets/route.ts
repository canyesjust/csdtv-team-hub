import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { mediaPublicUrl } from '@/lib/board-meetings/media-library'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const url = new URL(request.url)
  const type = url.searchParams.get('type')
  const search = url.searchParams.get('search')?.trim()
  const tag = url.searchParams.get('tag')

  let q = service.from('media_assets').select('*').order('created_at', { ascending: false })
  if (type) q = q.eq('asset_type', type)
  if (search) q = q.ilike('name', `%${search}%`)
  if (tag) q = q.contains('tags', [tag])

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const assets = (data || []).map(a => ({
    ...a,
    public_url: mediaPublicUrl(service, a.storage_path),
    thumbnail_url: a.thumbnail_path ? mediaPublicUrl(service, a.thumbnail_path) : mediaPublicUrl(service, a.storage_path),
  }))

  return NextResponse.json({ assets })
}
