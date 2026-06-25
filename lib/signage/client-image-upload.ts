/** Vercel serverless request bodies are capped (~4.5 MB). Stay under this before upload. */
export const SIGNAGE_MAX_UPLOAD_BYTES = 4 * 1024 * 1024

/** Videos upload directly to storage (signed URL), so they aren't bound by the
 *  serverless body cap. Keep a sane ceiling so a screen device isn't asked to
 *  stream something enormous. */
export const SIGNAGE_MAX_VIDEO_BYTES = 200 * 1024 * 1024

/**
 * Grab a poster frame from a video file in the browser (for the content
 * thumbnail). Resolves with a JPEG blob, or null if a frame can't be captured —
 * callers should treat null as "no thumbnail" and carry on.
 */
export function captureVideoPoster(file: File): Promise<Blob | null> {
  return new Promise(resolve => {
    let settled = false
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    const done = (blob: Blob | null) => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      resolve(blob)
    }

    video.muted = true
    video.playsInline = true
    video.preload = 'auto'

    const grab = () => {
      try {
        const vw = video.videoWidth || 640
        const vh = video.videoHeight || 360
        const scale = Math.min(1, 640 / Math.max(vw, vh))
        const w = Math.max(1, Math.round(vw * scale))
        const h = Math.max(1, Math.round(vh * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return done(null)
        ctx.drawImage(video, 0, 0, w, h)
        canvas.toBlob(b => done(b), 'image/jpeg', 0.75)
      } catch {
        done(null)
      }
    }

    video.onloadedmetadata = () => {
      const target = Math.min(1, (Number.isFinite(video.duration) ? video.duration : 2) * 0.1)
      video.onseeked = grab
      try {
        video.currentTime = target
      } catch {
        grab()
      }
    }
    video.onerror = () => done(null)
    // Safety net: if metadata/seek never resolves, give up.
    setTimeout(() => done(null), 8000)
    video.src = url
  })
}

const MAX_EDGE = 1920
const MIN_QUALITY = 0.55
const START_QUALITY = 0.82

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read this image. Try exporting as JPG or PNG.'))
    }
    img.src = url
  })
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (!blob) {
          reject(new Error('Could not compress image.'))
          return
        }
        resolve(blob)
      },
      'image/jpeg',
      quality,
    )
  })
}

/** Resize/compress in the browser so uploads fit platform body limits. */
export async function prepareSignageImageFile(file: File): Promise<File> {
  const mime = file.type.trim().toLowerCase()
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const isImage =
    mime.startsWith('image/') ||
    ext === 'jpg' ||
    ext === 'jpeg' ||
    ext === 'png' ||
    ext === 'webp'

  if (!isImage) {
    throw new Error('Choose a JPG, PNG, or WebP image.')
  }

  if (file.size <= SIGNAGE_MAX_UPLOAD_BYTES) {
    return file
  }

  const img = await loadImage(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
  const width = Math.max(1, Math.round(img.width * scale))
  const height = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not prepare image for upload.')

  ctx.drawImage(img, 0, 0, width, height)

  let quality = START_QUALITY
  let blob = await canvasToJpegBlob(canvas, quality)
  while (blob.size > SIGNAGE_MAX_UPLOAD_BYTES && quality > MIN_QUALITY) {
    quality -= 0.08
    blob = await canvasToJpegBlob(canvas, quality)
  }

  if (blob.size > SIGNAGE_MAX_UPLOAD_BYTES) {
    throw new Error('Image is too large. Use a smaller file or lower resolution (max 4 MB).')
  }

  const base = file.name.replace(/\.[^.]+$/, '') || 'signage-image'
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
}
