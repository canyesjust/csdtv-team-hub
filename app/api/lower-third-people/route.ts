import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { clearBoardMemberPeopleCache } from '@/lib/board-meetings/control-meeting-cache'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const search = searchParams.get('search')?.trim().toLowerCase()

  let q = service.from('lower_third_people').select('*').order('display_name')
  if (category && category !== 'all') q = q.eq('category', category)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let rows = data || []
  if (search) {
    rows = rows.filter(p => {
      const hay = `${p.display_name} ${p.primary_title || ''} ${p.affiliation || ''}`.toLowerCase()
      return hay.includes(search)
    })
  }

  return NextResponse.json({ people: rows })
}

export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json()
  if (!body.display_name?.trim()) {
    return NextResponse.json({ error: 'display_name is required' }, { status: 400 })
  }

  const category = body.category || 'other'
  const allowed = ['board_member', 'staff', 'presenter', 'other']
  if (!allowed.includes(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }

  const { data, error } = await service
    .from('lower_third_people')
    .insert({
      display_name: body.display_name.trim(),
      primary_title: body.primary_title?.trim() || null,
      affiliation: body.affiliation?.trim() || null,
      photo_path: body.photo_path || null,
      alternate_titles: body.alternate_titles || null,
      category,
      officer_position: body.officer_position?.trim() || null,
      group_label: body.group_label?.trim() || null,
      is_active: body.is_active !== false,
      created_by: teamUser.id,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  clearBoardMemberPeopleCache()
  return NextResponse.json({ person: data })
}
