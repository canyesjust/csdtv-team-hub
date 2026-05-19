import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { PLAYLIST_ITEM_TYPES } from '@/lib/board-meetings/playlist-types'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: templateId } = await params
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const itemType = String(body.item_type || '')
  if (!PLAYLIST_ITEM_TYPES.includes(itemType as (typeof PLAYLIST_ITEM_TYPES)[number])) {
    return NextResponse.json({ error: 'Invalid item type' }, { status: 400 })
  }

  const { data: maxRow } = await service
    .from('playlist_template_items')
    .select('sort_order')
    .eq('template_id', templateId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const sortOrder = (maxRow?.sort_order ?? -1) + 1

  const { data, error } = await service
    .from('playlist_template_items')
    .insert({
      template_id: templateId,
      item_type: itemType,
      media_asset_id: body.media_asset_id || null,
      info_card_config: body.info_card_config ?? null,
      duration_seconds: body.duration_seconds ?? null,
      label: typeof body.label === 'string' ? body.label.trim() : 'New item',
      transition: body.transition === 'cut' || body.transition === 'slide' ? body.transition : 'fade',
      sort_order: sortOrder,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}
