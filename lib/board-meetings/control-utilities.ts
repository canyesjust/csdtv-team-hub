import type { SupabaseClient } from '@supabase/supabase-js'
import { loadMeetingPlaylistBundle } from '@/lib/board-meetings/playlist-playback'
import { mediaPublicUrl } from '@/lib/board-meetings/media-library'
import { getCachedTimerTemplates } from '@/lib/board-meetings/control-static-cache'
import type { ControlBundle } from '@/lib/board-meetings/types'

export type ControlUtilitiesPayload = Pick<ControlBundle, 'meeting_playlist' | 'timer_templates'>

export async function loadControlUtilities(
  service: SupabaseClient,
  boardMeetingId: string,
): Promise<ControlUtilitiesPayload> {
  const [playlistBundle, timer_templates] = await Promise.all([
    loadMeetingPlaylistBundle(service, boardMeetingId),
    getCachedTimerTemplates(service),
  ])

  return {
    meeting_playlist: playlistBundle
      ? {
          playlist: playlistBundle.playlist,
          items: playlistBundle.items.map(it => {
            const asset = it.media_asset_id ? playlistBundle.assets.get(it.media_asset_id) : null
            return { ...it, asset_url: asset ? mediaPublicUrl(service, asset.storage_path) : null }
          }),
        }
      : null,
    timer_templates,
  }
}
