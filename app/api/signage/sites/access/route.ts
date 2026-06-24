import { NextRequest, NextResponse } from 'next/server'
import { requireManagerApi } from '@/lib/signage/server-auth'

export const dynamic = 'force-dynamic'

// GET /api/signage/sites/access?siteId=...  -> { teamIds: string[] }
export async function GET(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const siteId = new URL(request.url).searchParams.get('siteId')
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })
  const { data, error } = await auth.service
    .from('signage_site_access')
    .select('team_id')
    .eq('site_id', siteId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ teamIds: (data || []).map(r => r.team_id) })
}

// POST { site_id, team_ids: string[] } -> replaces the full access set for a site.
export async function POST(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const siteId = body.site_id ? String(body.site_id) : ''
  if (!siteId) return NextResponse.json({ error: 'site_id required' }, { status: 400 })
  const teamIds = Array.isArray(body.team_ids)
    ? Array.from(new Set((body.team_ids as unknown[]).map(String).filter(Boolean)))
    : []

  // Replace the set: clear existing grants, then insert the new ones.
  const { error: delErr } = await auth.service.from('signage_site_access').delete().eq('site_id', siteId)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 })

  if (teamIds.length) {
    const rows = teamIds.map(team_id => ({ team_id, site_id: siteId }))
    const { error: insErr } = await auth.service.from('signage_site_access').insert(rows)
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 })
  }

  return NextResponse.json({ siteId, teamIds })
}
