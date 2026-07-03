import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { OBS_ASSETS_BUCKET, OBS_CATEGORIES, canUploadObs, validateObsUpload, type ObsCategory } from '@/lib/obs-assets'

// Step 1 of an OBS-asset upload: hand the browser a signed URL so it can upload the
// file DIRECTLY to Supabase storage, bypassing the serverless request-body size limit.
// The browser then calls /finalize to record the row.
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canUploadObs(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const category = String(body.category || '')
  if (!OBS_CATEGORIES.includes(category as ObsCategory)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }

  const mime = String(body.mime || 'application/octet-stream')
  const sizeBytes = Number(body.size_bytes || 0)
  const filename = String(body.filename || 'upload')

  const validation = validateObsUpload(category as ObsCategory, mime, sizeBytes)
  if (validation) return NextResponse.json({ error: validation }, { status: 400 })

  const ext = filename.includes('.') ? filename.split('.').pop() : 'bin'
  const path = `${teamUser.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { data, error } = await service.storage.from(OBS_ASSETS_BUCKET).createSignedUploadUrl(path)
  if (error || !data) return NextResponse.json({ error: error?.message || 'Could not start upload' }, { status: 500 })

  return NextResponse.json({ bucket: OBS_ASSETS_BUCKET, path: data.path, token: data.token })
}
