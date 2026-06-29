import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isStaffOrManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { MEDIA_BUCKET, mediaPublicUrl, validateMediaUpload } from '@/lib/board-meetings/media-library'
import { ASSET_TYPES, type AssetType } from '@/lib/board-meetings/playlist-types'

export const dynamic = 'force-dynamic'

// Step 2 of a large-file upload: after the browser uploaded the file directly to
// storage via the signed URL, record the media_assets row. Verifies the object
// actually exists at the claimed path before inserting.
export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaffOrManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const assetType = String(body.asset_type || 'video')
  if (!ASSET_TYPES.includes(assetType as AssetType)) {
    return NextResponse.json({ error: 'Invalid asset type' }, { status: 400 })
  }

  const path = String(body.path || '')
  if (!path || !path.startsWith(`${teamUser.id}/`)) {
    return NextResponse.json({ error: 'Invalid upload path' }, { status: 400 })
  }

  const mime = String(body.mime || 'application/octet-stream')
  const sizeBytes = Number(body.size_bytes || 0)
  const validation = validateMediaUpload(mime, sizeBytes, assetType as AssetType)
  if (validation) return NextResponse.json({ error: validation }, { status: 400 })

  // Confirm the uploaded object is really there.
  const dir = path.split('/').slice(0, -1).join('/')
  const base = path.split('/').pop()
  const { data: listed } = await service.storage.from(MEDIA_BUCKET).list(dir, { search: base })
  if (!listed?.some(o => o.name === base)) {
    return NextResponse.json({ error: 'Upload not found in storage' }, { status: 400 })
  }

  const filename = String(body.filename || base || 'Untitled')
  const name = String(body.name || filename).trim() || filename
  const description = String(body.description || '').trim() || null
  const tags = Array.isArray(body.tags)
    ? body.tags.map((t: unknown) => String(t).trim()).filter(Boolean)
    : []
  const durationSeconds = body.duration_seconds != null ? Number(body.duration_seconds) : null
  const width = body.width != null ? Number(body.width) : null
  const height = body.height != null ? Number(body.height) : null

  const { data: row, error } = await service
    .from('media_assets')
    .insert({
      name,
      description,
      asset_type: assetType,
      filename,
      storage_path: path,
      file_size_bytes: sizeBytes || null,
      duration_seconds: durationSeconds,
      width,
      height,
      mime_type: mime,
      tags,
      thumbnail_path: assetType === 'image' ? path : null,
      uploaded_by: teamUser.id,
    })
    .select('*')
    .single()

  if (error || !row) return NextResponse.json({ error: error?.message || 'Insert failed' }, { status: 500 })

  return NextResponse.json({ asset: { ...row, public_url: mediaPublicUrl(service, row.storage_path) } })
}
