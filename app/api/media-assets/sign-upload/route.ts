import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { MEDIA_BUCKET, validateMediaUpload } from '@/lib/board-meetings/media-library'
import { ASSET_TYPES, type AssetType } from '@/lib/board-meetings/playlist-types'

export const dynamic = 'force-dynamic'

// Step 1 of a large-file upload: hand the browser a signed URL so it can upload
// the file DIRECTLY to Supabase storage, bypassing the serverless function's
// request-body size limit (the old route buffered the whole file in memory and
// capped out around a few MB). The browser then calls /finalize to record it.
export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const assetType = String(body.asset_type || 'video')
  if (!ASSET_TYPES.includes(assetType as AssetType)) {
    return NextResponse.json({ error: 'Invalid asset type' }, { status: 400 })
  }

  const mime = String(body.mime || 'application/octet-stream')
  const sizeBytes = Number(body.size_bytes || 0)
  const filename = String(body.filename || 'upload')

  const validation = validateMediaUpload(mime, sizeBytes, assetType as AssetType)
  if (validation) return NextResponse.json({ error: validation }, { status: 400 })

  const ext = filename.includes('.') ? filename.split('.').pop() : 'bin'
  const path = `${teamUser.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { data, error } = await service.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path)
  if (error || !data) return NextResponse.json({ error: error?.message || 'Could not start upload' }, { status: 500 })

  return NextResponse.json({ bucket: MEDIA_BUCKET, path: data.path, token: data.token })
}
