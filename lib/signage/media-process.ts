import sharp from 'sharp'

const MAX_IMAGE_WIDTH = 1920
const THUMB_WIDTH = 480
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_VIDEO_BYTES = 25 * 1024 * 1024

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const VIDEO_TYPES = new Set(['video/mp4'])

export function isAllowedImageMime(mime: string): boolean {
  return IMAGE_TYPES.has(mime)
}

export function isAllowedVideoMime(mime: string): boolean {
  return VIDEO_TYPES.has(mime)
}

export async function processSignageImage(buffer: Buffer): Promise<{ main: Buffer; thumb: Buffer; ext: string; contentType: string }> {
  const image = sharp(buffer).rotate()
  const meta = await image.metadata()
  if (!meta.width || !meta.height) throw new Error('Invalid image')

  const main = await image
    .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer()

  const thumb = await sharp(buffer)
    .rotate()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 75, mozjpeg: true })
    .toBuffer()

  if (main.length > MAX_IMAGE_BYTES) {
    throw new Error('Image too large after compression')
  }

  return { main, thumb, ext: 'jpg', contentType: 'image/jpeg' }
}

export function validateVideoBuffer(buffer: Buffer, mime: string): void {
  if (!VIDEO_TYPES.has(mime)) throw new Error('Video must be MP4')
  if (buffer.length > MAX_VIDEO_BYTES) throw new Error('Video must be 25 MB or smaller')
}

export function extFromVideoMime(mime: string): string {
  if (mime === 'video/mp4') return 'mp4'
  throw new Error('Unsupported video type')
}
