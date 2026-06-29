import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isStaffOrManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; item_id: string }> },
) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaffOrManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: templateId, item_id } = await params
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.label === 'string') patch.label = body.label.trim()
  if (body.media_asset_id !== undefined) patch.media_asset_id = body.media_asset_id || null
  if (body.info_card_config !== undefined) patch.info_card_config = body.info_card_config
  if (body.duration_seconds !== undefined) patch.duration_seconds = body.duration_seconds
  if (body.transition === 'cut' || body.transition === 'fade' || body.transition === 'slide') {
    patch.transition = body.transition
  }

  const { data, error } = await service
    .from('playlist_template_items')
    .update(patch)
    .eq('id', item_id)
    .eq('template_id', templateId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; item_id: string }> },
) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaffOrManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: templateId, item_id } = await params
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { error } = await service
    .from('playlist_template_items')
    .delete()
    .eq('id', item_id)
    .eq('template_id', templateId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
