import { NextRequest, NextResponse } from 'next/server'
import { requireManagerApi } from '@/lib/signage/server-auth'
import { SIGNAGE_MEDIA_BUCKET } from '@/lib/signage/constants'
import {
  extFromVideoMime,
  isAllowedImageMime,
  isAllowedVideoMime,
  isHeicFile,
  processSignageImage,
  resolveImageMime,
  resolveVideoMime,
  validateVideoBuffer,
} from '@/lib/signage/media-process'

export const dynamic = 'force-dynamic'

/** Manager direct upload — creates approved content with targeting. */
export async function POST(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const { service } = auth

  const form = await request.formData()
  const title = String(form.get('title') ?? '').trim()
  const startDate = String(form.get('start_date') ?? '').trim()
  const endDate = String(form.get('end_date') ?? '').trim()
  const allScreens = String(form.get('all_screens') ?? 'false') === 'true'
  const targetAreaIds = JSON.parse(String(form.get('target_area_ids') ?? '[]')) as string[]
  const targetScreenIds = JSON.parse(String(form.get('target_screen_ids') ?? '[]')) as string[]
  const priority = parseInt(String(form.get('priority') ?? '0'), 10) || 0
  const fullScreen = String(form.get('full_screen') ?? 'false') === 'true'
  const image = form.get('image')
  const video = form.get('video')

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'Dates are required.' }, { status: 400 })
  }

  const hasImage = image instanceof File && image.size > 0
  const hasVideo = video instanceof File && video.size > 0
  if (!hasImage && !hasVideo) {
    return NextResponse.json({ error: 'Upload an image or video.' }, { status: 400 })
  }

  let type: 'image' | 'video' = 'image'
  let mediaPath = ''
  let thumbPath: string | null = null

  if (
    !allScreens &&
    targetAreaIds.length === 0 &&
    targetScreenIds.length === 0
  ) {
    return NextResponse.json({ error: 'Select "All screens" or at least one area/screen.' }, { status: 400 })
  }

  try {
    if (hasImage && image instanceof File) {
      if (isHeicFile(image)) {
        return NextResponse.json({ error: 'HEIC photos are not supported. Save as JPG or PNG first.' }, { status: 400 })
      }
      const imageMime = resolveImageMime(image)
      if (!isAllowedImageMime(imageMime)) {
        return NextResponse.json({ error: 'Image must be JPG, PNG, or WebP.' }, { status: 400 })
      }
      const processed = await processSignageImage(Buffer.from(await image.arrayBuffer()))
      const id = crypto.randomUUID()
      mediaPath = `${id}.${processed.ext}`
      thumbPath = `${id}-thumb.${processed.ext}`
      const { error: upMain } = await service.storage.from(SIGNAGE_MEDIA_BUCKET).upload(mediaPath, processed.main, { contentType: processed.contentType, upsert: false })
      if (upMain) throw upMain
      const { error: upThumb } = await service.storage.from(SIGNAGE_MEDIA_BUCKET).upload(thumbPath, processed.thumb, { contentType: processed.contentType, upsert: false })
      if (upThumb) throw upThumb
    } else if (hasVideo && video instanceof File) {
      type = 'video'
      const videoMime = resolveVideoMime(video)
      if (!isAllowedVideoMime(videoMime)) {
        return NextResponse.json({ error: 'Video must be MP4.' }, { status: 400 })
      }
      const raw = Buffer.from(await video.arrayBuffer())
      validateVideoBuffer(raw, videoMime)
      mediaPath = `${crypto.randomUUID()}.${extFromVideoMime(videoMime)}`
      const { error: upVid } = await service.storage.from(SIGNAGE_MEDIA_BUCKET).upload(mediaPath, raw, { contentType: videoMime, upsert: false })
      if (upVid) throw upVid
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Upload failed'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const { data, error } = await service.from('signage_content').insert({
    type,
    title: title || null,
    media_path: mediaPath,
    thumb_path: thumbPath,
    status: 'approved',
    start_date: startDate,
    end_date: endDate,
    all_screens: allScreens,
    target_area_ids: targetAreaIds,
    target_screen_ids: targetScreenIds,
    priority,
    full_screen: fullScreen,
  }).select('*').single()

  if (error) {
    await service.storage.from(SIGNAGE_MEDIA_BUCKET).remove([mediaPath, ...(thumbPath ? [thumbPath] : [])]).catch(() => {})
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ content: data })
}
