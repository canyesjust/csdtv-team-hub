import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { SIGNAGE_MEDIA_BUCKET } from '@/lib/signage/constants'
import { buildNewSubmissionEmailBody, emailSignageApprovers } from '@/lib/signage/email'
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
import { formatSignageUploadError } from '@/lib/signage/upload-errors'

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

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)

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
  const areaId = String(form.get('area_id') ?? '').trim()
  const startDate = String(form.get('start_date') ?? '').trim()
  const endDate = String(form.get('end_date') ?? '').trim()
  const requestedNote = String(form.get('requested_note') ?? '').trim()
  const termsAccepted = String(form.get('terms_accepted') ?? '')

  // Optional announcement section
  const annTitle = String(form.get('ann_title') ?? '').trim()
  const annSubtitle = String(form.get('ann_subtitle') ?? '').trim()
  // Optional visitor section
  const visitorName = String(form.get('visitor_name') ?? '').trim()
  const visitorNote = String(form.get('visitor_note') ?? '').trim()
  const visitDate = String(form.get('visit_date') ?? '').trim()
  // Optional media section
  const image = form.get('image')
  const video = form.get('video')

  const hasImage = image instanceof File && image.size > 0
  const hasVideo = video instanceof File && video.size > 0
  const hasMedia = hasImage || hasVideo
  const hasAnnouncement = annTitle.length > 0
  const hasVisitor = visitorName.length > 0

  // Validation -----------------------------------------------------------------
  if (!submitterName || !submitterEmail) {
    return NextResponse.json({ error: 'Your name and email are required.' }, { status: 400 })
  }
  if (!validEmail(submitterEmail)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }
  if (termsAccepted !== 'true') {
    return NextResponse.json({ error: 'You must accept the terms before submitting.' }, { status: 400 })
  }
  if (!areaId) {
    return NextResponse.json({ error: 'Choose an area.' }, { status: 400 })
  }
  if (!hasMedia && !hasAnnouncement && !hasVisitor) {
    return NextResponse.json({ error: 'Add at least one item: a visitor, an announcement, or an image.' }, { status: 400 })
  }
  if (hasImage && hasVideo) {
    return NextResponse.json({ error: 'Submit either an image or a video, not both.' }, { status: 400 })
  }
  if ((hasMedia || hasAnnouncement)) {
    if (!isDate(startDate) || !isDate(endDate)) {
      return NextResponse.json({ error: 'Choose valid show-from and show-until dates.' }, { status: 400 })
    }
    if (startDate > endDate) {
      return NextResponse.json({ error: 'Show-from date must be on or before show-until.' }, { status: 400 })
    }
  }
  if (hasVisitor && !isDate(visitDate)) {
    return NextResponse.json({ error: 'Choose the visit date.' }, { status: 400 })
  }

  // Resolve the area's site so everything is scoped to the right location.
  const { data: areaRow } = await service.from('signage_areas').select('id, site_id').eq('id', areaId).maybeSingle()
  if (!areaRow) {
    return NextResponse.json({ error: 'That area no longer exists.' }, { status: 400 })
  }
  const siteId = areaRow.site_id as string | null

  // 1. Media (image/video) ------------------------------------------------------
  let mediaPath = ''
  let thumbPath: string | null = null
  if (hasMedia) {
    let type: 'image' | 'video' = 'image'
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
        if (upThumb) throw upThumb
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
        const ext = extFromVideoMime(videoMime)
        mediaPath = `${crypto.randomUUID()}.${ext}`
        const { error: upVid } = await service.storage.from(SIGNAGE_MEDIA_BUCKET).upload(mediaPath, raw, { contentType: videoMime, upsert: false })
        if (upVid) throw upVid
      }
    } catch (e) {
      console.error('signage submit upload error:', e)
      return NextResponse.json({ error: formatSignageUploadError(e) }, { status: 400 })
    }

    const { error: insertErr } = await service.from('signage_content').insert({
      type,
      title: requestedNote ? requestedNote.slice(0, 80) : null,
      media_path: mediaPath,
      thumb_path: thumbPath,
      status: 'pending',
      site_id: siteId,
      start_date: startDate,
      end_date: endDate,
      submitter_name: submitterName,
      submitter_email: submitterEmail,
      requested_note: requestedNote || null,
      terms_accepted_at: new Date().toISOString(),
      all_screens: false,
      target_area_ids: [areaId],
      target_screen_ids: [],
    })
    if (insertErr) {
      await service.storage.from(SIGNAGE_MEDIA_BUCKET).remove([mediaPath, ...(thumbPath ? [thumbPath] : [])]).catch(() => {})
      return NextResponse.json({ error: 'Could not save the image submission.' }, { status: 500 })
    }
  }

  // 2. Announcement -------------------------------------------------------------
  if (hasAnnouncement) {
    const { error } = await service.from('signage_announcements').insert({
      title: annTitle,
      subtitle: annSubtitle || null,
      site_id: siteId,
      area_id: areaId,
      pending: true,
      active: false,
      in_ticker: true,
      priority: 0,
      all_screens: false,
      target_area_ids: [areaId],
      target_screen_ids: [],
      start_date: startDate || null,
      end_date: endDate || null,
      submitter_name: submitterName,
      submitter_email: submitterEmail,
    })
    if (error) {
      return NextResponse.json({ error: 'Could not save the announcement.' }, { status: 500 })
    }
  }

  // 3. Visitor ------------------------------------------------------------------
  if (hasVisitor) {
    const { error } = await service.from('signage_visitors').insert({
      name: visitorName,
      note: visitorNote || null,
      visit_date: visitDate,
      site_id: siteId,
      area_id: areaId,
      pending: true,
      active: false,
      submitter_name: submitterName,
      submitter_email: submitterEmail,
    })
    if (error) {
      return NextResponse.json({ error: 'Could not save the visitor.' }, { status: 500 })
    }
  }

  let centerName: string | null = null
  if (siteId) {
    const { data: siteRow } = await service.from('signage_sites').select('center_name').eq('id', siteId).maybeSingle()
    centerName = siteRow?.center_name ?? null
  }

  void emailSignageApprovers(buildNewSubmissionEmailBody({
    submitterName,
    submitterEmail,
    title: [hasVisitor ? 'visitor' : null, hasAnnouncement ? 'announcement' : null, hasMedia ? 'image' : null].filter(Boolean).join(', ') || null,
    startDate: startDate || visitDate,
    endDate: endDate || visitDate,
    requestedNote: requestedNote || null,
    centerName,
  }))

  return NextResponse.json({ success: true })
}
