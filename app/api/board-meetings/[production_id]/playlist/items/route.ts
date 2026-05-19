import { NextResponse } from 'next/server'
import { withPlaylistContext, playlistError } from '@/lib/board-meetings/playlist-route'
import { ensurePlaylist } from '@/lib/board-meetings/playlist-playback'
import { PLAYLIST_ITEM_TYPES } from '@/lib/board-meetings/playlist-types'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withPlaylistContext(production_id, async ({ service }) => {
    const body = await request.json().catch(() => ({}))
    const itemType = String(body.item_type || '')
    if (!PLAYLIST_ITEM_TYPES.includes(itemType as (typeof PLAYLIST_ITEM_TYPES)[number])) {
      return playlistError('Invalid item type')
    }

    const bundle = await ensurePlaylist(service, production_id)
    const { data: maxRow } = await service
      .from('meeting_playlist_items')
      .select('sort_order')
      .eq('meeting_playlist_id', bundle.playlist.id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data, error } = await service
      .from('meeting_playlist_items')
      .insert({
        meeting_playlist_id: bundle.playlist.id,
        item_type: itemType,
        media_asset_id: body.media_asset_id || null,
        info_card_config: body.info_card_config ?? null,
        duration_seconds: body.duration_seconds ?? null,
        label: typeof body.label === 'string' ? body.label.trim() : 'New item',
        transition: body.transition === 'cut' || body.transition === 'slide' ? body.transition : 'fade',
        sort_order: (maxRow?.sort_order ?? -1) + 1,
      })
      .select('*')
      .single()

    if (error) return playlistError(error.message, 500)
    return NextResponse.json({ item: data })
  })
}
