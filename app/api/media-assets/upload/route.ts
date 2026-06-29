import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isStaffOrManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { MEDIA_BUCKET, mediaPublicUrl, validateMediaUpload } from '@/lib/board-meetings/media-library'
import { ASSET_TYPES, type AssetType } from '@/lib/board-meetings/playlist-types'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaffOrManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const form = await request.formData()
  const file = form.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  }

  const assetType = String(form.get('asset_type') || 'video')
  if (!ASSET_TYPES.includes(assetType as AssetType)) {
    return NextResponse.json({ error: 'Invalid asset type' }, { status: 400 })
  }

  const mime = file.type || 'application/octet-stream'
  const buf = Buffer.from(await file.arrayBuffer())
  const validation = validateMediaUpload(mime, buf.length, assetType as AssetType)
  if (validation) return NextResponse.json({ error: validation }, { status: 400 })

  const name = String(form.get('name') || file.name || 'Untitled').trim()
  const description = String(form.get('description') || '').trim() || null
  const tagsRaw = String(form.get('tags') || '')
  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : []
  const durationSeconds = form.get('duration_seconds')
  const width = form.get('width')
  const height = form.get('height')

  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
  const path = `${teamUser.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error: upErr } = await service.storage
    .from(MEDIA_BUCKET)
    .upload(path, buf, { contentType: mime, upsert: false })

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: row, error } = await service
    .from('media_assets')
    .insert({
      name,
      description,
      asset_type: assetType,
      filename: file.name,
      storage_path: path,
      file_size_bytes: buf.length,
      duration_seconds: durationSeconds ? Number(durationSeconds) : null,
      width: width ? Number(width) : null,
      height: height ? Number(height) : null,
      mime_type: mime,
      tags,
      thumbnail_path: assetType === 'image' ? path : null,
      uploaded_by: teamUser.id,
    })
    .select('*')
    .single()

  if (error || !row) return NextResponse.json({ error: error?.message || 'Insert failed' }, { status: 500 })

  return NextResponse.json({
    asset: {
      ...row,
      public_url: mediaPublicUrl(service, row.storage_path),
    },
  })
}
