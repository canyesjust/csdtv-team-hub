import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isStaffOrManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaffOrManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const newName = typeof body.new_name === 'string' ? body.new_name.trim() : ''

  const { data: src } = await service.from('playlist_templates').select('*').eq('id', id).maybeSingle()
  if (!src) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const { data: created, error } = await service
    .from('playlist_templates')
    .insert({
      name: newName || `${src.name} (copy)`,
      description: src.description,
      default_music_bed_id: src.default_music_bed_id,
      loop_behavior: src.loop_behavior,
      is_default: false,
      created_by: teamUser.id,
    })
    .select('*')
    .single()

  if (error || !created) return NextResponse.json({ error: error?.message || 'Duplicate failed' }, { status: 500 })

  const { data: items } = await service
    .from('playlist_template_items')
    .select('*')
    .eq('template_id', id)
    .order('sort_order', { ascending: true })

  if (items?.length) {
    await service.from('playlist_template_items').insert(
      items.map((it, i) => ({
        template_id: created.id,
        item_type: it.item_type,
        media_asset_id: it.media_asset_id,
        info_card_config: it.info_card_config,
        duration_seconds: it.duration_seconds,
        label: it.label,
        transition: it.transition,
        sort_order: i,
      })),
    )
  }

  return NextResponse.json({ template: created })
}
