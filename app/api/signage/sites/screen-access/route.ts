import { NextRequest, NextResponse } from 'next/server'
import { requireManagerApi } from '@/lib/signage/server-auth'

export const dynamic = 'force-dynamic'

// Manager-only, like /api/signage/sites/access — granting access is an admin
// act, never something a signage editor can do for themselves.

// GET /api/signage/sites/screen-access -> { grants: { team_id, screen_id }[] }
export async function GET() {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const { data, error } = await auth.service
    .from('signage_screen_access')
    .select('team_id, screen_id')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ grants: data || [] })
}

// POST { team_id, screen_ids: string[] } -> replaces that person's full set of
// single-screen grants. Sending [] clears them.
export async function POST(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const teamId = body.team_id ? String(body.team_id) : ''
  if (!teamId) return NextResponse.json({ error: 'team_id required' }, { status: 400 })

  const screenIds = Array.isArray(body.screen_ids)
    ? Array.from(new Set((body.screen_ids as unknown[]).map(String).filter(Boolean)))
    : []

  // Never grant a screen that doesn't exist — a bad id would otherwise sit in
  // the table forever and confuse the scope resolver.
  if (screenIds.length > 0) {
    const { data: real, error: checkErr } = await auth.service
      .from('signage_screens')
      .select('id')
      .in('id', screenIds)
    if (checkErr) return NextResponse.json({ error: checkErr.message }, { status: 400 })
    if ((real?.length ?? 0) !== screenIds.length) {
      return NextResponse.json({ error: 'One or more screens no longer exist' }, { status: 400 })
    }
  }

  const { error: delErr } = await auth.service
    .from('signage_screen_access')
    .delete()
    .eq('team_id', teamId)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 })

  if (screenIds.length > 0) {
    const { error: insErr } = await auth.service
      .from('signage_screen_access')
      .insert(screenIds.map((screen_id) => ({ team_id: teamId, screen_id })))
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 })
  }

  return NextResponse.json({ teamId, screenIds })
}
