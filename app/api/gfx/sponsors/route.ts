import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isStaffOrManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

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
    .from('graphics_sponsors')
    .select('id, name, tagline, scope, school_code, active, sort_order')
    .order('sort_order').order('name')
  return NextResponse.json({ sponsors: data || [] })
}

export async function POST(request: Request) {
  const gate = await requireStaff()
  if ('error' in gate) return gate.error
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 160) : null
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const { data, error } = await gate.service
    .from('graphics_sponsors')
    .insert({
      name,
      tagline: typeof body.tagline === 'string' ? body.tagline.slice(0, 300) : null,
      scope: body.scope === 'school' ? 'school' : 'district',
      school_code: typeof body.school_code === 'string' ? body.school_code : null,
    })
    .select('id').single()
  if (error) return NextResponse.json({ error: 'Could not save the sponsor' }, { status: 500 })
  return NextResponse.json({ success: true, id: data.id })
}

export async function DELETE(request: Request) {
  const gate = await requireStaff()
  if ('error' in gate) return gate.error
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await gate.service.from('graphics_sponsors').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Could not delete the sponsor' }, { status: 500 })
  return NextResponse.json({ success: true })
}
