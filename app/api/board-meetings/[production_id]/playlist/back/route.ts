import { NextResponse } from 'next/server'
import { withPlaylistContext, playlistError } from '@/lib/board-meetings/playlist-route'
import { playlistSkip } from '@/lib/board-meetings/playlist-playback'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withPlaylistContext(production_id, async ({ service }) => {
    try {
      await playlistSkip(service, production_id, -1)
      return NextResponse.json({ success: true })
    } catch (e) {
      return playlistError(e instanceof Error ? e.message : 'Back failed', 500)
    }
  })
}
