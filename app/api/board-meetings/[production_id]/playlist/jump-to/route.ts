import { NextResponse } from 'next/server'
import { withPlaylistContext, playlistError } from '@/lib/board-meetings/playlist-route'
import { playlistJumpTo } from '@/lib/board-meetings/playlist-playback'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withPlaylistContext(production_id, async ({ service }) => {
    const body = await request.json().catch(() => ({}))
    if (!body?.item_id) return playlistError('item_id required')
    try {
      await playlistJumpTo(service, production_id, body.item_id)
      return NextResponse.json({ success: true })
    } catch (e) {
      return playlistError(e instanceof Error ? e.message : 'Jump failed', 500)
    }
  })
}
