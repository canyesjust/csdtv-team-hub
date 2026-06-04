export const SIG_BUCKET = 'sig-assets'

export const SIG_ASSETS_UPDATED_KEY = 'sig_assets_updated'

export type SigAssetId = 'banner' | 'csdtv-logo' | 'csdtv-white' | 'canyons-logo'

export type SigAssetDef = {
  id: SigAssetId
  filename: string
  label: string
  hint: string
}

export const SIG_ASSETS: SigAssetDef[] = [
  {
    id: 'banner',
    filename: 'banner.png',
    label: 'Email banner',
    hint: 'Wide header image for Outlook signatures (stacked CSDTV banner).',
  },
  {
    id: 'csdtv-logo',
    filename: 'csdtv-logo.png',
    label: 'CSDTV logo (color)',
    hint: 'Full-color logo on transparent or light background.',
  },
  {
    id: 'csdtv-white',
    filename: 'csdtv-white.png',
    label: 'CSDTV logo (white)',
    hint: 'White logo for dark backgrounds.',
  },
  {
    id: 'canyons-logo',
    filename: 'canyons-logo.png',
    label: 'Canyons logo',
    hint: 'District logo paired with CSDTV branding.',
  },
]

export const SIG_ASSET_BY_ID = new Map(SIG_ASSETS.map(a => [a.id, a]))
export const SIG_ASSET_FILENAMES = new Set(SIG_ASSETS.map(a => a.filename))

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

export function contentTypeForSigFile(filename: string): string {
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg'
  if (filename.endsWith('.webp')) return 'image/webp'
  if (filename.endsWith('.gif')) return 'image/gif'
  return 'image/png'
}

export function validateSigUpload(file: File, buf: Buffer): string | null {
  if (file.type && !ALLOWED.has(file.type)) {
    return 'Image must be PNG, JPEG, WebP, or GIF'
  }
  if (buf.length > MAX_BYTES) return 'Image must be 5 MB or smaller'
  return null
}

export function parseSigVersions(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function sigPublicPath(filename: string): string {
  return `/sig/${filename}`
}

/** ETag for cache validation; changes whenever a manager re-uploads the file. */
export function sigEtag(filename: string, version: string | null | undefined): string {
  return `"${filename}:${version || 'bundled'}"`
}

export function sigAbsoluteUrl(
  siteBase: string,
  filename: string,
  version?: string | null,
): string {
  const base = siteBase.replace(/\/$/, '')
  const path = sigPublicPath(filename)
  if (!version) return `${base}${path}`
  return `${base}${path}?v=${encodeURIComponent(version)}`
}
