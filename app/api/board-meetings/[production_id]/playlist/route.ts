import { NextResponse } from 'next/server'
import { withPlaylistContext, playlistError } from '@/lib/board-meetings/playlist-route'
import { loadMeetingPlaylistBundle } from '@/lib/board-meetings/playlist-playback'
import { mediaPublicUrl } from '@/lib/board-meetings/media-library'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withPlaylistContext(production_id, async ({ service, boardMeetingId }) => {
    const bundle = await loadMeetingPlaylistBundle(service, boardMeetingId)
    if (!bundle) return NextResponse.json({ playlist: null, items: [] })

    const items = bundle.items.map(it => {
      const asset = it.media_asset_id ? bundle.assets.get(it.media_asset_id) : null
      return {
        ...it,
        asset_url: asset ? mediaPublicUrl(service, asset.storage_path) : null,
        asset_type: asset?.asset_type ?? null,
      }
    })

    return NextResponse.json({ playlist: bundle.playlist, items })
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withPlaylistContext(production_id, async ({ service, boardMeetingId }) => {
    const bundle = await loadMeetingPlaylistBundle(service, boardMeetingId)
    if (!bundle) return playlistError('Playlist not found', 404)

    const body = await request.json().catch(() => ({}))
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.music_bed_id !== undefined) patch.music_bed_id = body.music_bed_id || null
    if (body.loop_behavior === 'play_once' || body.loop_behavior === 'loop_all') patch.loop_behavior = body.loop_behavior
    if (typeof body.play_during_live === 'boolean') patch.play_during_live = body.play_during_live
    if (typeof body.play_during_recess === 'boolean') patch.play_during_recess = body.play_during_recess

    const { data, error } = await service
      .from('meeting_playlists')
      .update(patch)
      .eq('id', bundle.playlist.id)
      .select('*')
      .single()

    if (error) return playlistError(error.message, 500)
    return NextResponse.json({ playlist: data })
  })
}
