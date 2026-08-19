import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isStaffOrManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { sanitizePlayers } from '@/lib/graphics/rosters'

export const dynamic = 'force-dynamic'

async function requireStaff() {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!isStaffOrManagerRole(teamUser.role)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const service = getServiceSupabaseClient()
  if (!service) return { error: NextResponse.json({ error: 'Server configuration error' }, { status: 500 }) }
  return { service }
}

export async function GET() {
  const gate = await requireStaff()
  if ('error' in gate) return gate.error
  const { data } = await gate.service
    .from('graphics_rosters')
    .select('id, name, school_code, sport, season, players')
    .order('name')
  return NextResponse.json({ rosters: data || [] })
}

/** Saved per school, team, sport and season, so last year's is still there. */
export async function POST(request: Request) {
  const gate = await requireStaff()
  if ('error' in gate) return gate.error
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 160) : null
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const { data, error } = await gate.service
    .from('graphics_rosters')
    .insert({
      name,
      school_code: typeof body.school_code === 'string' ? body.school_code : null,
      sport: typeof body.sport === 'string' ? body.sport.slice(0, 60) : null,
      season: typeof body.season === 'string' ? body.season.slice(0, 30) : null,
      players: sanitizePlayers(body.players),
    })
    .select('id').single()
  if (error) return NextResponse.json({ error: 'Could not save the roster' }, { status: 500 })
  return NextResponse.json({ success: true, id: data.id })
}
