import { NextResponse } from 'next/server'
import { withPlaylistContext } from '@/lib/board-meetings/playlist-route'
import { playlistClearReplace } from '@/lib/board-meetings/playlist-playback'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withPlaylistContext(production_id, async ({ service }) => {
    await playlistClearReplace(service, production_id)
    return NextResponse.json({ success: true })
  })
}
