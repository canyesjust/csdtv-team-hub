import type { SupabaseClient } from '@supabase/supabase-js'

export const OBS_ASSETS_BUCKET = 'obs-assets'

/** Roles that may upload and manage OBS assets (mirrors equipment editor roles). */
const OBS_UPLOADER_ROLES = new Set(['Manager', 'Staff', 'Intern', 'Student Intern'])

export function canUploadObs(role: string | null | undefined): boolean {
  return OBS_UPLOADER_ROLES.has(role || '')
}

export const OBS_CATEGORIES = ['commercial', 'scene', 'starting_soon'] as const
export type ObsCategory = (typeof OBS_CATEGORIES)[number]
export type ObsKind = 'video' | 'image' | 'scene'

const VIDEO_MIMES = new Set(['video/mp4', 'video/quicktime'])
const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const SCENE_MIMES = new Set(['application/json', 'application/zip', 'application/x-zip-compressed'])

const MAX_VIDEO_BYTES = 5 * 1024 * 1024 * 1024 // 5 GB
const MAX_IMAGE_BYTES = 50 * 1024 * 1024       // 50 MB
const MAX_SCENE_BYTES = 100 * 1024 * 1024      // 100 MB

/** Resolve the stored `kind` for an upload, or null if the mime is not allowed. */
export function kindForUpload(category: ObsCategory, mime: string): ObsKind | null {
  if (category === 'commercial') {
    if (VIDEO_MIMES.has(mime)) return 'video'
    if (IMAGE_MIMES.has(mime)) return 'image'
    return null
  }
  if (category === 'scene') {
    if (SCENE_MIMES.has(mime)) return 'scene'
    return null
  }
  if (category === 'starting_soon') {
    if (VIDEO_MIMES.has(mime)) return 'video'
    return null
  }
  return null
}

/** Validate a proposed upload. Returns an error string, or null when valid. */
export function validateObsUpload(category: ObsCategory, mime: string, sizeBytes: number): string | null {
  if (category === 'commercial') {
    if (VIDEO_MIMES.has(mime)) {
      if (sizeBytes > MAX_VIDEO_BYTES) return 'Video must be 5 GB or smaller'
      return null
    }
    if (IMAGE_MIMES.has(mime)) {
      if (sizeBytes > MAX_IMAGE_BYTES) return 'Image must be 50 MB or smaller'
      return null
    }
    return 'Commercial must be an MP4/MOV video or a PNG, JPEG, or WebP image'
  }
  if (category === 'scene') {
    if (!SCENE_MIMES.has(mime)) return 'Scene must be a .json or .zip file'
    if (sizeBytes > MAX_SCENE_BYTES) return 'Scene must be 50 MB or smaller'
    return null
  }
  if (category === 'starting_soon') {
    if (!VIDEO_MIMES.has(mime)) return 'Starting Soon must be an MP4 or MOV video'
    if (sizeBytes > MAX_VIDEO_BYTES) return 'Video must be 5 GB or smaller'
    return null
  }
  return 'Invalid category'
}

/** Short-lived signed URL for downloading a private OBS asset object. */
export async function obsSignedDownloadUrl(
  service: SupabaseClient,
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const { data, error } = await service.storage
    .from(OBS_ASSETS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}
