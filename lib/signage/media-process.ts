import sharp from 'sharp'

const MAX_IMAGE_WIDTH = 1920
const THUMB_WIDTH = 480
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_VIDEO_BYTES = 25 * 1024 * 1024

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const VIDEO_TYPES = new Set(['video/mp4'])

const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-citrix-jpeg': 'image/jpeg',
}

export function normalizeImageMime(mime: string): string {
  const lower = mime.trim().toLowerCase()
  return MIME_ALIASES[lower] ?? lower
}

/** Vercel caps request bodies around 4.5 MB — reject larger raw uploads early. */
export const MAX_RAW_UPLOAD_BYTES = 4.5 * 1024 * 1024

const EXT_TO_IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

/** Browsers often omit File.type — infer from extension when possible. */
export function resolveImageMime(file: File): string {
  const declared = normalizeImageMime(file.type)
  if (declared && declared !== 'application/octet-stream') return declared
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TO_IMAGE_MIME[ext] ?? declared
}

export function resolveVideoMime(file: File): string {
  const declared = file.type.trim().toLowerCase()
  if (declared && declared !== 'application/octet-stream') return declared
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'mp4') return 'video/mp4'
  return declared
}

export function isHeicFile(file: File): boolean {
  const mime = resolveImageMime(file)
  if (mime === 'image/heic' || mime === 'image/heif') return true
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return ext === 'heic' || ext === 'heif'
}

export function isAllowedImageMime(mime: string): boolean {
  return IMAGE_TYPES.has(normalizeImageMime(mime))
}

export function isAllowedVideoMime(mime: string): boolean {
  return VIDEO_TYPES.has(mime)
}

export async function processSignageImage(buffer: Buffer): Promise<{ main: Buffer; thumb: Buffer; ext: string; contentType: string }> {
  if (buffer.length > MAX_RAW_UPLOAD_BYTES) {
    throw new Error('Image must be 4 MB or smaller.')
  }

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
