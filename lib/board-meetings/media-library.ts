import type { SupabaseClient } from '@supabase/supabase-js'
import type { AssetType } from '@/lib/board-meetings/playlist-types'

export const MEDIA_BUCKET = 'media-library'

const VIDEO_MIMES = new Set(['video/mp4', 'video/quicktime'])
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const AUDIO_MIMES = new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav'])

export const MAX_VIDEO_BYTES = 500 * 1024 * 1024
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024
export const MAX_AUDIO_BYTES = 50 * 1024 * 1024

/** Public object URL with path segments encoded (spaces, etc.). */
export function mediaPublicUrl(_service: SupabaseClient, storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
  if (!base) {
    const { data } = _service.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath)
    return data.publicUrl
  }
  const encoded = storagePath.split('/').map(encodeURIComponent).join('/')
  return `${base}/storage/v1/object/public/${MEDIA_BUCKET}/${encoded}`
}

/** Signed URL for playback on public pages (works when the bucket is private). */
export async function mediaPlaybackUrl(
  service: SupabaseClient,
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const { data, error } = await service.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds)
  if (!error && data?.signedUrl) return data.signedUrl
  return mediaPublicUrl(service, storagePath)
}

export function validateMediaUpload(
  mimeType: string,
  sizeBytes: number,
  assetType: AssetType,
): string | null {
  if (assetType === 'video' || assetType === 'bumper') {
    if (!VIDEO_MIMES.has(mimeType)) return 'Video must be MP4 or MOV'
    if (sizeBytes > MAX_VIDEO_BYTES) return 'Video must be 500 MB or smaller'
    return null
  }
  if (assetType === 'image') {
    if (!IMAGE_MIMES.has(mimeType)) return 'Image must be JPEG, PNG, or WebP'
    if (sizeBytes > MAX_IMAGE_BYTES) return 'Image must be 25 MB or smaller'
    return null
  }
  if (assetType === 'audio_bed') {
    if (!AUDIO_MIMES.has(mimeType)) return 'Audio bed must be MP3 or WAV'
    if (sizeBytes > MAX_AUDIO_BYTES) return 'Audio bed must be 50 MB or smaller'
    return null
  }
  return 'Invalid asset type'
}

export async function getMediaAssetUsage(
  service: SupabaseClient,
  assetId: string,
): Promise<{ templates: string[]; meetings: string[] }> {
  const [tplItems, meetItems, tplBed, meetBed, meetReplace] = await Promise.all([
    service.from('playlist_template_items').select('template_id').eq('media_asset_id', assetId),
    service.from('meeting_playlist_items').select('meeting_playlist_id').eq('media_asset_id', assetId),
    service.from('playlist_templates').select('name').eq('default_music_bed_id', assetId),
    service.from('meeting_playlists').select('board_meeting_id').eq('music_bed_id', assetId),
    service.from('meeting_playlists').select('board_meeting_id').eq('replace_now_asset_id', assetId),
  ])

  const templateIds = new Set((tplItems.data || []).map(r => r.template_id))
  const meetingPlaylistIds = new Set((meetItems.data || []).map(r => r.meeting_playlist_id))

  let templates: string[] = (tplBed.data || []).map(t => t.name)
  if (templateIds.size > 0) {
    const { data: tpls } = await service
      .from('playlist_templates')
      .select('name')
      .in('id', [...templateIds])
    templates = [...templates, ...(tpls || []).map(t => t.name)]
  }

  const meetingIds = new Set([
    ...(meetBed.data || []).map(r => r.board_meeting_id),
    ...(meetReplace.data || []).map(r => r.board_meeting_id),
  ])
  if (meetingPlaylistIds.size > 0) {
    const { data: mps } = await service
      .from('meeting_playlists')
      .select('board_meeting_id')
      .in('id', [...meetingPlaylistIds])
    for (const m of mps || []) meetingIds.add(m.board_meeting_id)
  }

  return {
    templates: [...new Set(templates)],
    meetings: [...meetingIds],
  }
}

export async function assertMediaAssetDeletable(
  service: SupabaseClient,
  assetId: string,
): Promise<void> {
  const usage = await getMediaAssetUsage(service, assetId)
  if (usage.templates.length > 0 || usage.meetings.length > 0) {
    const parts = []
    if (usage.templates.length) parts.push(`templates: ${usage.templates.join(', ')}`)
    if (usage.meetings.length) parts.push(`${usage.meetings.length} meeting playlist(s)`)
    throw new Error(`Asset is in use (${parts.join('; ')}). Remove references first.`)
  }
}
