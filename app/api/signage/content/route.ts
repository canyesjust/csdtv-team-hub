import { NextRequest, NextResponse } from 'next/server'
import { requireSignageEditorApi } from '@/lib/signage/server-auth'
import { markScreensDirty } from '@/lib/signage/ablesign-helpers'
import { SIGNAGE_MEDIA_BUCKET } from '@/lib/signage/constants'
import {
  extFromVideoMime,
  isAllowedImageMime,
  isAllowedVideoMime,
  isHeicFile,
  MAX_RAW_UPLOAD_BYTES,
  processSignageImage,
  resolveImageMime,
  resolveVideoMime,
  validateVideoBuffer,
} from '@/lib/signage/media-process'
import { clampDisplaySeconds, sanitizeSignageHtml } from '@/lib/signage/content-display'
import { formatSignageUploadError } from '@/lib/signage/upload-errors'

export const dynamic = 'force-dynamic'

/** Manager direct upload — creates approved content with targeting. */
export async function POST(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { service } = auth

  const form = await request.formData()
  const title = String(form.get('title') ?? '').trim()
  const startDate = String(form.get('start_date') ?? '').trim()
  const endDate = String(form.get('end_date') ?? '').trim()
  const allScreens = String(form.get('all_screens') ?? 'false') === 'true'
  const targetAreaIds = JSON.parse(String(form.get('target_area_ids') ?? '[]')) as string[]
  const targetScreenIds = JSON.parse(String(form.get('target_screen_ids') ?? '[]')) as string[]
  const targetBuildings = JSON.parse(String(form.get('target_buildings') ?? '[]')) as string[]
  const priority = parseInt(String(form.get('priority') ?? '0'), 10) || 0
  const fullScreen = String(form.get('full_screen') ?? 'false') === 'true'
  const displaySeconds = clampDisplaySeconds(form.get('display_seconds'))
  const contentType = String(form.get('content_type') ?? 'image').trim()
  const htmlBody = String(form.get('html_body') ?? '').trim()
  // Stock/system blocks (broadcast board, etc.) carry no media — the feed renders
  // them dynamically. They're still scheduled + targeted like normal content.
  const systemKind = String(form.get('system_kind') ?? '').trim()
  const isSystem = ['broadcast_board', 'calendar', 'website', 'national_day'].includes(systemKind)
  // Website blocks store the page URL in html_body (the feed wraps it in an iframe).
  const websiteUrl = String(form.get('website_url') ?? '').trim()
  const source = String(form.get('source') ?? '').trim() || null
  const statusInput = String(form.get('status') ?? 'approved').trim()
  const status = statusInput === 'pending' ? 'pending' : 'approved'
  let genMeta: unknown = null
  try { const g = form.get('gen_meta'); if (g) genMeta = JSON.parse(String(g)) } catch { genMeta = null }
  const image = form.get('image')
  const video = form.get('video')

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'Dates are required.' }, { status: 400 })
  }

  const hasImage = image instanceof File && image.size > 0
  const hasVideo = video instanceof File && video.size > 0
  const isHtml = contentType === 'html' && !isSystem

  if (!hasImage && !hasVideo && !isHtml && !isSystem) {
    return NextResponse.json({ error: 'Upload an image or video, or add HTML content.' }, { status: 400 })
  }
  if (isHtml && !htmlBody) {
    return NextResponse.json({ error: 'HTML body is required for HTML content.' }, { status: 400 })
  }

  let type: 'image' | 'video' | 'html' = (isHtml || isSystem) ? 'html' : 'image'
  let mediaPath: string | null = null
  let thumbPath: string | null = null
  let storedHtml: string | null = null
  if (systemKind === 'website' && websiteUrl) storedHtml = websiteUrl

  if (
    !isSystem &&
    !allScreens &&
    targetAreaIds.length === 0 &&
    targetScreenIds.length === 0
  ) {
    return NextResponse.json({ error: 'Select "All screens" or at least one area/screen.' }, { status: 400 })
  }

  try {
    if (isHtml) {
      storedHtml = sanitizeSignageHtml(htmlBody)
    } else if (hasImage && image instanceof File) {
      if (isHeicFile(image)) {
        return NextResponse.json({ error: 'HEIC photos are not supported. Save as JPG or PNG first.' }, { status: 400 })
      }
      const imageMime = resolveImageMime(image)
      if (!isAllowedImageMime(imageMime)) {
        return NextResponse.json({ error: 'Image must be JPG, PNG, or WebP.' }, { status: 400 })
      }
      const raw = Buffer.from(await image.arrayBuffer())
      if (raw.length > MAX_RAW_UPLOAD_BYTES) {
        return NextResponse.json({ error: 'Image must be 4 MB or smaller.' }, { status: 400 })
      }
      const processed = await processSignageImage(raw)
      const id = crypto.randomUUID()
      mediaPath = `${id}.${processed.ext}`
      thumbPath = `${id}-thumb.${processed.ext}`
      const { error: upMain } = await service.storage.from(SIGNAGE_MEDIA_BUCKET).upload(mediaPath, processed.main, { contentType: processed.contentType, upsert: false })
      if (upMain) throw upMain
      const { error: upThumb } = await service.storage.from(SIGNAGE_MEDIA_BUCKET).upload(thumbPath, processed.thumb, { contentType: processed.contentType, upsert: false })
      if (upThumb) {
        await service.storage.from(SIGNAGE_MEDIA_BUCKET).remove([mediaPath]).catch(() => {})
        throw upThumb
      }
    } else if (hasVideo && video instanceof File) {
      type = 'video'
      const videoMime = resolveVideoMime(video)
      if (!isAllowedVideoMime(videoMime)) {
        return NextResponse.json({ error: 'Video must be MP4.' }, { status: 400 })
      }
      const raw = Buffer.from(await video.arrayBuffer())
      if (raw.length > MAX_RAW_UPLOAD_BYTES) {
        return NextResponse.json({ error: 'Video must be 4 MB or smaller for upload.' }, { status: 400 })
      }
      validateVideoBuffer(raw, videoMime)
      mediaPath = `${crypto.randomUUID()}.${extFromVideoMime(videoMime)}`
      const { error: upVid } = await service.storage.from(SIGNAGE_MEDIA_BUCKET).upload(mediaPath, raw, { contentType: videoMime, upsert: false })
      if (upVid) throw upVid
    }
  } catch (e) {
    console.error('signage content upload error:', e)
    const msg = formatSignageUploadError(e)
    if (typeof e === 'object' && e && 'message' in e && String((e as { message: string }).message).includes('Bucket not found')) {
      return NextResponse.json({ error: 'Storage bucket signage-media is missing. Run the signage media migration on Supabase.' }, { status: 500 })
    }
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const { data, error } = await service.from('signage_content').insert({
    type,
    site_id: String(form.get('site_id') ?? '') || null,
    title: title || null,
    media_path: mediaPath,
    thumb_path: thumbPath,
    html_body: storedHtml,
    system_kind: isSystem ? systemKind : null,
    display_seconds: displaySeconds,
    status,
    source,
    gen_meta: genMeta,
    start_date: startDate,
    end_date: endDate,
    all_screens: allScreens,
    target_area_ids: targetAreaIds,
    target_screen_ids: targetScreenIds,
    target_buildings: targetBuildings,
    priority,
    full_screen: fullScreen,
  }).select('*').single()

  if (error) {
    if (mediaPath) {
      await service.storage.from(SIGNAGE_MEDIA_BUCKET).remove([mediaPath, ...(thumbPath ? [thumbPath] : [])]).catch(() => {})
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Flag affected screens for an AbleSign HTML re-push (the cron coalesces these).
  await markScreensDirty(service, data.site_id ? { siteId: data.site_id } : { all: true })

  return NextResponse.json({ content: data })
}
