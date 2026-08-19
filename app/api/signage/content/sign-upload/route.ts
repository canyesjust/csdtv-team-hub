import { NextRequest, NextResponse } from 'next/server'
import { requireSignageEditorApi } from '@/lib/signage/server-auth'
import { SIGNAGE_MEDIA_BUCKET } from '@/lib/signage/constants'
import { checkRateLimit } from '@/lib/server/rate-limit'

export const dynamic = 'force-dynamic'

const MAX_VIDEO_BYTES = 200 * 1024 * 1024 // 200 MB ceiling for direct uploads

/**
 * Step 1 of a large signage video upload: hand the browser signed URLs so it
 * can upload the video (and its poster thumbnail) DIRECTLY to Supabase storage,
 * bypassing the serverless function's ~4.5 MB request-body limit. The browser
 * uploads to these URLs, then calls /finalize to create the content row.
 */
export async function POST(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { user, service } = auth

  // Each call mints a slot for a 200 MB object in a public-read bucket, and the
  // row that would justify it isn't created until /finalize. Bound it per user
  // so a compromised or careless editor account can't fill the bucket.
  const rl = await checkRateLimit(request, {
    scope: 'signage_sign_upload',
    keySuffix: user.id,
    max: 20,
    windowMs: 60 * 60 * 1000,
  })
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many uploads started. Try again in a bit.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

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
