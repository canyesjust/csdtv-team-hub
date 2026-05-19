import { NextResponse } from 'next/server'
import { withPlaylistContext, playlistError } from '@/lib/board-meetings/playlist-route'
import { applyTemplateToMeeting } from '@/lib/board-meetings/playlist-playback'
import { mediaPublicUrl } from '@/lib/board-meetings/media-library'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withPlaylistContext(production_id, async ({ service }) => {
    const body = await request.json().catch(() => ({}))
    const templateId = body?.template_id
    if (!templateId || typeof templateId !== 'string') {
      return playlistError('template_id required')
    }

    try {
      const bundle = await applyTemplateToMeeting(service, production_id, templateId)
      const items = bundle.items.map(it => {
        const asset = it.media_asset_id ? bundle.assets.get(it.media_asset_id) : null
        return {
          ...it,
          asset_url: asset ? mediaPublicUrl(service, asset.storage_path) : null,
        }
      })
      return NextResponse.json({ playlist: bundle.playlist, items })
    } catch (e) {
      return playlistError(e instanceof Error ? e.message : 'Apply failed', 500)
    }
  })
}
