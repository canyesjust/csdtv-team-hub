import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isStaffOrManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { MEDIA_BUCKET, assertMediaAssetDeletable, getMediaAssetUsage, mediaPublicUrl } from '@/lib/board-meetings/media-library'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data, error } = await service.from('media_assets').select('*').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const usage = await getMediaAssetUsage(service, id)
  return NextResponse.json({
    asset: {
      ...data,
      public_url: mediaPublicUrl(service, data.storage_path),
    },
    usage,
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaffOrManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.name === 'string') patch.name = body.name.trim()
  if (typeof body.description === 'string') patch.description = body.description.trim() || null
  if (Array.isArray(body.tags)) patch.tags = body.tags

  const { data, error } = await service.from('media_assets').update(patch).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ asset: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaffOrManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  try {
    await assertMediaAssetDeletable(service, id)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Delete blocked' }, { status: 400 })
  }

  const { data: row } = await service.from('media_assets').select('storage_path, thumbnail_path').eq('id', id).maybeSingle()
  const { error } = await service.from('media_assets').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (row?.storage_path) await service.storage.from(MEDIA_BUCKET).remove([row.storage_path])
  if (row?.thumbnail_path && row.thumbnail_path !== row.storage_path) {
    await service.storage.from(MEDIA_BUCKET).remove([row.thumbnail_path])
  }

  return NextResponse.json({ success: true })
}
