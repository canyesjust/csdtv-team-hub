import { NextResponse } from 'next/server'
import { withPlaylistContext, playlistError } from '@/lib/board-meetings/playlist-route'
import { loadMeetingPlaylistBundle } from '@/lib/board-meetings/playlist-playback'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withPlaylistContext(production_id, async ({ service, boardMeetingId }) => {
    const bundle = await loadMeetingPlaylistBundle(service, boardMeetingId)
    if (!bundle) return playlistError('Playlist not found', 404)

    const body = await request.json().catch(() => ({}))
    const orderedIds = body?.ordered_ids
    if (!Array.isArray(orderedIds)) return playlistError('ordered_ids required')

    for (let i = 0; i < orderedIds.length; i++) {
      await service
        .from('meeting_playlist_items')
        .update({ sort_order: i })
        .eq('id', orderedIds[i])
        .eq('meeting_playlist_id', bundle.playlist.id)
    }

    return NextResponse.json({ success: true })
  })
}
