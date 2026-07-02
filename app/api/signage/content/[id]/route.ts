import { NextRequest, NextResponse } from 'next/server'
import { requireSignageEditorApi, requireSignageApproverApi } from '@/lib/signage/server-auth'
import { markScreensDirty } from '@/lib/signage/ablesign-helpers'
import { SIGNAGE_MEDIA_BUCKET } from '@/lib/signage/constants'
import { emailSignageSubmitterDecision } from '@/lib/signage/email'
import { clampDisplaySeconds, sanitizeSignageHtml } from '@/lib/signage/content-display'
import {
  isAllowedImageMime,
  isAllowedVideoMime,
  processSignageImage,
  validateVideoBuffer,
  extFromVideoMime,
} from '@/lib/signage/media-process'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSignageApproverApi()
  if ('error' in auth) return auth.error
  const { user, service } = auth
  const { id } = await params

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { data: existing } = await service.from('signage_content').select('*').eq('id', id).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (typeof body.status === 'string') {
    if (!['pending', 'approved', 'rejected'].includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    patch.status = body.status
    patch.reviewed_by = user.id
    patch.reviewed_at = new Date().toISOString()
    if (body.status === 'approved') {
      const allScreens = typeof body.all_screens === 'boolean' ? body.all_screens : existing.all_screens
      const areaIds = Array.isArray(body.target_area_ids) ? body.target_area_ids : existing.target_area_ids
      const screenIds = Array.isArray(body.target_screen_ids) ? body.target_screen_ids : existing.target_screen_ids
      const buildings = Array.isArray(body.target_buildings) ? body.target_buildings : (existing.target_buildings ?? [])
      if (!allScreens && areaIds.length === 0 && screenIds.length === 0 && buildings.length === 0) {
        patch.all_screens = true
      }
    }
  }
  if (typeof body.all_screens === 'boolean') patch.all_screens = body.all_screens
  if (Array.isArray(body.target_area_ids)) patch.target_area_ids = body.target_area_ids
  if (Array.isArray(body.target_screen_ids)) patch.target_screen_ids = body.target_screen_ids
  if (Array.isArray(body.target_buildings)) patch.target_buildings = body.target_buildings
  if (typeof body.start_date === 'string') patch.start_date = body.start_date
  if (typeof body.end_date === 'string') patch.end_date = body.end_date
  if (typeof body.priority === 'number') patch.priority = body.priority
  else if (typeof body.priority === 'string' && body.priority.trim()) patch.priority = parseInt(body.priority, 10) || 0
  if (typeof body.full_screen === 'boolean') patch.full_screen = body.full_screen
  if (typeof body.title === 'string') patch.title = body.title
  if (body.display_seconds !== undefined) patch.display_seconds = clampDisplaySeconds(body.display_seconds)
  if (typeof body.html_body === 'string') patch.html_body = sanitizeSignageHtml(body.html_body)
  if (body.reject_reason === null || typeof body.reject_reason === 'string') {
    patch.reject_reason = body.reject_reason
  }

  const { data, error } = await service.from('signage_content').update(patch).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await markScreensDirty(service, existing.site_id ? { siteId: existing.site_id } : { all: true })

  if (typeof body.status === 'string' && existing.submitter_email) {
    if (body.status === 'approved' || body.status === 'rejected') {
      let centerName: string | null = null
      if (existing.site_id) {
        const { data: siteRow } = await service.from('signage_sites').select('center_name').eq('id', existing.site_id).maybeSingle()
        centerName = siteRow?.center_name ?? null
      }
      void emailSignageSubmitterDecision({
        email: existing.submitter_email,
        name: existing.submitter_name || 'there',
        approved: body.status === 'approved',
        title: existing.title,
        rejectReason: body.reject_reason ?? existing.reject_reason,
        centerName,
      })
    }
  }

  return NextResponse.json({ content: data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { service } = auth
  const { id } = await params

  const { data: row } = await service.from('signage_content').select('media_path, thumb_path, site_id').eq('id', id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const paths = [row.media_path, row.thumb_path].filter((p): p is string => Boolean(p && !p.startsWith('html/')))
  await service.storage.from(SIGNAGE_MEDIA_BUCKET).remove(paths).catch(() => {})
  const { error } = await service.from('signage_content').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await markScreensDirty(service, row.site_id ? { siteId: row.site_id } : { all: true })

  return NextResponse.json({ success: true })
}
