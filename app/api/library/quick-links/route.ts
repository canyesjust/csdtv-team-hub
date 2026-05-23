import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { isStudentInternRole } from '@/lib/roles'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data, error } = await service
    .from('quick_links')
    .select('*')
    .eq('active', true)
    .order('sort_order')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ links: data ?? [] })
}

export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isStudentInternRole(teamUser.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  let url = typeof body.url === 'string' ? body.url.trim() : ''
  if (!title || !url) {
    return NextResponse.json({ error: 'Title and URL are required' }, { status: 400 })
  }
  if (!url.startsWith('http')) url = `https://${url}`

  const { count } = await service
    .from('quick_links')
    .select('id', { count: 'exact', head: true })
    .eq('active', true)

  const { data, error } = await service
    .from('quick_links')
    .insert({
      title,
      url,
      description: typeof body.description === 'string' ? body.description.trim() || null : null,
      category: typeof body.category === 'string' ? body.category : 'General',
      created_by: teamUser.id,
      sort_order: count ?? 0,
      active: true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ link: data })
}
