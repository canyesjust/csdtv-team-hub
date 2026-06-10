/** Vercel serverless request bodies are capped (~4.5 MB). Stay under this before upload. */
export const SIGNAGE_MAX_UPLOAD_BYTES = 4 * 1024 * 1024

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
