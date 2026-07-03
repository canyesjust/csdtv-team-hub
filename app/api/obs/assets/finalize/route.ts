import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { OBS_ASSETS_BUCKET, OBS_CATEGORIES, canUploadObs, kindForUpload, validateObsUpload, type ObsCategory } from '@/lib/obs-assets'

// Step 2 of an OBS-asset upload: after the browser uploaded the file directly to
// storage via the signed URL, record the obs_assets row. Verifies the object actually
// exists at the claimed path before inserting.
export const dynamic = 'force-dynamic'

// Turn a raw upload filename into a readable default display name:
// "CIC_RecruitmentVideo_v8_YYYYMMDD[v8].mp4" -> "CIC RecruitmentVideo YYYYMMDD".
function cleanAssetName(filename: string): string {
  let n = filename.replace(/\.[^.]+$/, '')   // drop extension
  n = n.replace(/[[(]v\d+[\])]/gi, '')       // drop [v8] / (v8)
  n = n.replace(/[_.]+/g, ' ')               // underscores/dots -> spaces
  n = n.replace(/\s+/g, ' ').trim()
  return n || filename
}

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

  const path = String(body.path || '')
  if (!path || !path.startsWith(`${teamUser.id}/`)) {
    return NextResponse.json({ error: 'Invalid upload path' }, { status: 400 })
  }

  const mime = String(body.mime || 'application/octet-stream')
  const sizeBytes = Number(body.size_bytes || 0)
  const validation = validateObsUpload(category as ObsCategory, mime, sizeBytes)
  if (validation) return NextResponse.json({ error: validation }, { status: 400 })

  const kind = kindForUpload(category as ObsCategory, mime)
  if (!kind) return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })

  // Confirm the uploaded object is really there.
  const dir = path.split('/').slice(0, -1).join('/')
  const base = path.split('/').pop()
  const { data: listed } = await service.storage.from(OBS_ASSETS_BUCKET).list(dir, { search: base })
  if (!listed?.some(o => o.name === base)) {
    return NextResponse.json({ error: 'Upload not found in storage' }, { status: 400 })
  }

  const filename = String(body.filename || base || 'Untitled')
  const provided = String(body.name || '').trim()
  // Use a typed-in name only if it differs from the raw filename; otherwise
  // auto-clean the filename so operators see something readable.
  const name = provided && provided !== filename ? provided : cleanAssetName(filename)
  const description = String(body.description || '').trim() || null

  const { data: row, error } = await service
    .from('obs_assets')
    .insert({
      category,
      name,
      description,
      filename,
      storage_path: path,
      mime_type: mime,
      file_size_bytes: sizeBytes || null,
      kind,
      created_by: teamUser.id,
    })
    .select('id, category, name, filename, kind, mime_type, file_size_bytes, enabled, created_at')
    .single()

  if (error || !row) return NextResponse.json({ error: error?.message || 'Insert failed' }, { status: 500 })

  return NextResponse.json({ asset: row })
}
