import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { SIGNAGE_MEDIA_BUCKET } from '@/lib/signage/constants'
import { buildNewSubmissionEmailBody, emailSignageApprovers } from '@/lib/signage/email'
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

const RATE_WINDOW_MS = 60 * 1000
const RATE_MAX = 8
const attempts = new Map<string, number[]>()

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}

function rateLimited(key: string): boolean {
  const now = Date.now()
  const recent = (attempts.get(key) || []).filter(ts => now - ts < RATE_WINDOW_MS)
  recent.push(now)
  attempts.set(key, recent)
  return recent.length > RATE_MAX
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function POST(request: NextRequest) {
  if (rateLimited(clientIp(request))) {
    return NextResponse.json({ error: 'Too many submissions. Please wait a minute.' }, { status: 429 })
  }

  const service = getServiceSupabaseClient()
  if (!service) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const form = await request.formData()
  const submitterName = String(form.get('submitter_name') ?? '').trim()
  const submitterEmail = String(form.get('submitter_email') ?? '').trim().toLowerCase()
  const title = String(form.get('title') ?? '').trim()
  const startDate = String(form.get('start_date') ?? '').trim()
  const endDate = String(form.get('end_date') ?? '').trim()
  const requestedNote = String(form.get('requested_note') ?? '').trim()
  const termsAccepted = String(form.get('terms_accepted') ?? '')
  const image = form.get('image')
  const video = form.get('video')

  if (!submitterName || !submitterEmail || !startDate || !endDate) {
    return NextResponse.json({ error: 'Name, email, and dates are required.' }, { status: 400 })
  }
  if (!validEmail(submitterEmail)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }
  if (termsAccepted !== 'true') {
    return NextResponse.json({ error: 'You must accept the terms before submitting.' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return NextResponse.json({ error: 'Use valid start and end dates.' }, { status: 400 })
  }
  if (startDate > endDate) {
    return NextResponse.json({ error: 'Start date must be on or before end date.' }, { status: 400 })
  }

  const hasImage = image instanceof File && image.size > 0
  const hasVideo = video instanceof File && video.size > 0
  if (!hasImage && !hasVideo) {
    return NextResponse.json({ error: 'Choose an image or video to upload.' }, { status: 400 })
  }
  if (hasImage && hasVideo) {
    return NextResponse.json({ error: 'Submit either an image or a video, not both.' }, { status: 400 })
  }

  let type: 'image' | 'video' = 'image'
  let mediaPath = ''
  let thumbPath: string | null = null

  try {
    if (hasImage && image instanceof File) {
      if (isHeicFile(image)) {
        return NextResponse.json({ error: 'HEIC photos are not supported. Save as JPG or PNG first.' }, { status: 400 })
      }
      const imageMime = resolveImageMime(image)
      if (!isAllowedImageMime(imageMime)) {
        return NextResponse.json({ error: 'Image must be JPG, PNG, or WebP.' }, { status: 400 })
      }
      const raw = Buffer.from(await image.arrayBuffer())
      const processed = await processSignageImage(raw)
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
      const ext = extFromVideoMime(videoMime)
      mediaPath = `${crypto.randomUUID()}.${ext}`
      const { error: upVid } = await service.storage.from(SIGNAGE_MEDIA_BUCKET).upload(mediaPath, raw, { contentType: videoMime, upsert: false })
      if (upVid) throw upVid
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Upload failed'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const { error: insertErr } = await service.from('signage_content').insert({
    type,
    title: title || null,
    media_path: mediaPath,
    thumb_path: thumbPath,
    status: 'pending',
    start_date: startDate,
    end_date: endDate,
    submitter_name: submitterName,
    submitter_email: submitterEmail,
    requested_note: requestedNote || null,
    terms_accepted_at: new Date().toISOString(),
    all_screens: false,
    target_area_ids: [],
    target_screen_ids: [],
  })

  if (insertErr) {
    await service.storage.from(SIGNAGE_MEDIA_BUCKET).remove([mediaPath, ...(thumbPath ? [thumbPath] : [])]).catch(() => {})
    return NextResponse.json({ error: 'Could not save submission.' }, { status: 500 })
  }

  void emailSignageApprovers(buildNewSubmissionEmailBody({
    submitterName,
    submitterEmail,
    title: title || null,
    startDate,
    endDate,
    requestedNote: requestedNote || null,
  }))

  return NextResponse.json({ success: true })
}
