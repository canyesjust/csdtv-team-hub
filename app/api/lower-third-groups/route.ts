import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isStaffOrManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data, error } = await service.from('lower_third_groups').select('*').order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ groups: data || [] })
}

export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaffOrManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json()
  if (!body.name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!Array.isArray(body.member_ids) || body.member_ids.length === 0) {
    return NextResponse.json({ error: 'member_ids required' }, { status: 400 })
  }

  const layout = body.default_layout || 'primary_secondary'
  const layouts = ['primary_secondary', 'all_equal', 'names_only']
  if (!layouts.includes(layout)) {
    return NextResponse.json({ error: 'Invalid default_layout' }, { status: 400 })
  }

  const { data, error } = await service
    .from('lower_third_groups')
    .insert({
      name: body.name.trim(),
      member_ids: body.member_ids,
      default_layout: layout,
      created_by: teamUser.id,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ group: data })
}
