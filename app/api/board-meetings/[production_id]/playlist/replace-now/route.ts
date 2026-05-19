import { NextResponse } from 'next/server'
import { withPlaylistContext, playlistError } from '@/lib/board-meetings/playlist-route'
import { playlistReplaceNow } from '@/lib/board-meetings/playlist-playback'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withPlaylistContext(production_id, async ({ service }) => {
    const body = await request.json().catch(() => ({}))
    if (!body?.asset_id) return playlistError('asset_id required')
    try {
      await playlistReplaceNow(service, production_id, body.asset_id, body.duration_seconds)
      return NextResponse.json({ success: true })
    } catch (e) {
      return playlistError(e instanceof Error ? e.message : 'Replace failed', 500)
    }
  })
}
