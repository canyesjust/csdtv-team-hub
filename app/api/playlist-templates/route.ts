import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data: templates, error } = await service
    .from('playlist_templates')
    .select('*')
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (templates || []).map(t => t.id)
  const counts = new Map<string, number>()
  if (ids.length > 0) {
    const { data: items } = await service.from('playlist_template_items').select('template_id').in('template_id', ids)
    for (const it of items || []) {
      counts.set(it.template_id, (counts.get(it.template_id) || 0) + 1)
    }
  }

  return NextResponse.json({
    templates: (templates || []).map(t => ({ ...t, item_count: counts.get(t.id) || 0 })),
  })
}

export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const { data, error } = await service
    .from('playlist_templates')
    .insert({
      name,
      description: typeof body.description === 'string' ? body.description.trim() || null : null,
      default_music_bed_id: body.default_music_bed_id || null,
      loop_behavior: body.loop_behavior === 'play_once' ? 'play_once' : 'loop_all',
      created_by: teamUser.id,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data })
}
