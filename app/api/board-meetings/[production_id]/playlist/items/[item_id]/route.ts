import { NextResponse } from 'next/server'
import { withPlaylistContext, playlistError } from '@/lib/board-meetings/playlist-route'
import { loadMeetingPlaylistBundle } from '@/lib/board-meetings/playlist-playback'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ production_id: string; item_id: string }> },
) {
  const { production_id, item_id } = await params
  return withPlaylistContext(production_id, async ({ service, boardMeetingId }) => {
    const bundle = await loadMeetingPlaylistBundle(service, boardMeetingId)
    if (!bundle) return playlistError('Playlist not found', 404)

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
      .from('meeting_playlist_items')
      .update(patch)
      .eq('id', item_id)
      .eq('meeting_playlist_id', bundle.playlist.id)
      .select('*')
      .single()

    if (error) return playlistError(error.message, 500)
    return NextResponse.json({ item: data })
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ production_id: string; item_id: string }> },
) {
  const { production_id, item_id } = await params
  return withPlaylistContext(production_id, async ({ service, boardMeetingId }) => {
    const bundle = await loadMeetingPlaylistBundle(service, boardMeetingId)
    if (!bundle) return playlistError('Playlist not found', 404)

    const { error } = await service
      .from('meeting_playlist_items')
      .delete()
      .eq('id', item_id)
      .eq('meeting_playlist_id', bundle.playlist.id)

    if (error) return playlistError(error.message, 500)
    return NextResponse.json({ success: true })
  })
}
