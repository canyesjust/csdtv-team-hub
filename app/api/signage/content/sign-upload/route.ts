import { NextRequest, NextResponse } from 'next/server'
import { requireManagerApi } from '@/lib/signage/server-auth'
import { SIGNAGE_MEDIA_BUCKET } from '@/lib/signage/constants'

export const dynamic = 'force-dynamic'

const MAX_VIDEO_BYTES = 200 * 1024 * 1024 // 200 MB ceiling for direct uploads

/**
 * Step 1 of a large signage video upload: hand the browser signed URLs so it
 * can upload the video (and its poster thumbnail) DIRECTLY to Supabase storage,
 * bypassing the serverless function's ~4.5 MB request-body limit. The browser
 * uploads to these URLs, then calls /finalize to create the content row.
 */
export async function POST(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const { service } = auth

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const mime = String(body.mime || '')
  const sizeBytes = Number(body.size_bytes || 0)

  if (mime !== 'video/mp4') {
    return NextResponse.json({ error: 'Video must be MP4.' }, { status: 400 })
  }
  if (!sizeBytes || sizeBytes > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: 'Video must be 200 MB or smaller.' }, { status: 400 })
  }

  const id = crypto.randomUUID()
  const videoPath = `${id}.mp4`
  const thumbPath = `${id}-thumb.jpg`

  const [videoSigned, thumbSigned] = await Promise.all([
    service.storage.from(SIGNAGE_MEDIA_BUCKET).createSignedUploadUrl(videoPath),
    service.storage.from(SIGNAGE_MEDIA_BUCKET).createSignedUploadUrl(thumbPath),
  ])

  if (videoSigned.error || !videoSigned.data) {
    return NextResponse.json({ error: videoSigned.error?.message || 'Could not start upload' }, { status: 500 })
  }

  return NextResponse.json({
    bucket: SIGNAGE_MEDIA_BUCKET,
    video: { path: videoSigned.data.path, token: videoSigned.data.token },
    thumb: thumbSigned.data
      ? { path: thumbSigned.data.path, token: thumbSigned.data.token }
      : null,
  })
}
