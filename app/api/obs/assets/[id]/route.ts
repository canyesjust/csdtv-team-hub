import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { OBS_ASSETS_BUCKET, canUploadObs } from '@/lib/obs-assets'

// Rename or delete an OBS asset. Uploader roles only.
export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canUploadObs(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const update: { updated_at: string; name?: string; enabled?: boolean } = {
    updated_at: new Date().toISOString(),
  }
  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (name.length > 200) return NextResponse.json({ error: 'Name is too long (200 characters max)' }, { status: 400 })
    update.name = name
  }
  if (typeof body.enabled === 'boolean') {
    update.enabled = body.enabled
  }
  if (update.name === undefined && update.enabled === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data: row, error } = await service
    .from('obs_assets')
    .update(update)
    .eq('id', id)
    .select('id, category, name, filename, kind, mime_type, file_size_bytes, enabled, created_at')
    .single()

  if (error || !row) return NextResponse.json({ error: error?.message || 'Not found' }, { status: 404 })
  return NextResponse.json({ asset: row })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canUploadObs(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data: row } = await service.from('obs_assets').select('storage_path').eq('id', id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (row.storage_path) {
    await service.storage.from(OBS_ASSETS_BUCKET).remove([row.storage_path as string])
  }

  const { error } = await service.from('obs_assets').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
