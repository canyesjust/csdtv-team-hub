import { NextRequest, NextResponse } from 'next/server'
import { requireSignageEditorApi } from '@/lib/signage/server-auth'
import { SIGNAGE_MEDIA_BUCKET } from '@/lib/signage/constants'
import { clampDisplaySeconds } from '@/lib/signage/content-display'

export const dynamic = 'force-dynamic'

// Only accept simple storage filenames we minted in sign-upload (no paths).
const SAFE_VIDEO = /^[a-f0-9-]+\.mp4$/i
const SAFE_THUMB = /^[a-f0-9-]+-thumb\.jpg$/i

/**
 * Step 2 of a large signage video upload: the browser has already uploaded the
 * video (and poster) directly to storage; here we just create the approved
 * content row that points at those objects.
 */
export async function POST(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { service } = auth

  const body = await request.json().catch(() => ({})) as Record<string, unknown>

  const mediaPath = String(body.media_path || '')
  if (!SAFE_VIDEO.test(mediaPath)) {
    return NextResponse.json({ error: 'Invalid media path' }, { status: 400 })
  }
  const thumbPath = body.thumb_path && SAFE_THUMB.test(String(body.thumb_path)) ? String(body.thumb_path) : null

  const startDate = String(body.start_date || '').trim()
  const endDate = String(body.end_date || '').trim()
  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'Dates are required.' }, { status: 400 })
  }

  const allScreens = body.all_screens === true
  const targetAreaIds = Array.isArray(body.target_area_ids) ? (body.target_area_ids as unknown[]).map(String) : []
  const targetScreenIds = Array.isArray(body.target_screen_ids) ? (body.target_screen_ids as unknown[]).map(String) : []
  if (!allScreens && targetAreaIds.length === 0 && targetScreenIds.length === 0) {
    return NextResponse.json({ error: 'Select "All screens" or at least one area/screen.' }, { status: 400 })
  }

  // Confirm the uploaded object actually exists before recording it.
  const { data: head } = await service.storage.from(SIGNAGE_MEDIA_BUCKET).list('', { search: mediaPath, limit: 1 })
  if (!head || !head.some(f => f.name === mediaPath)) {
    return NextResponse.json({ error: 'Upload not found in storage — please try again.' }, { status: 400 })
  }

  const { data, error } = await service.from('signage_content').insert({
    type: 'video',
    site_id: body.site_id ? String(body.site_id) : null,
    title: body.title ? String(body.title) : null,
    media_path: mediaPath,
    thumb_path: thumbPath,
    html_body: null,
    display_seconds: clampDisplaySeconds(body.display_seconds),
    status: 'approved',
    start_date: startDate,
    end_date: endDate,
    all_screens: allScreens,
    target_area_ids: targetAreaIds,
    target_screen_ids: targetScreenIds,
    priority: typeof body.priority === 'number' ? body.priority : parseInt(String(body.priority ?? '0'), 10) || 0,
    full_screen: body.full_screen === true,
  }).select('*').single()

  if (error) {
    // Roll back the orphaned storage objects so we don't leak files.
    await service.storage.from(SIGNAGE_MEDIA_BUCKET).remove([mediaPath, ...(thumbPath ? [thumbPath] : [])]).catch(() => {})
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ content: data })
}
