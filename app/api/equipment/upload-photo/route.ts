import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { getAuthenticatedTeamUser, isStaffOrManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_DIM = 1200

/**
 * Upload a photo for an equipment item. Mirrors the lower-third uploader: auth
 * staff/manager, validate, resize down so stored photos stay small, push to the
 * public equipment-photos bucket, and return the public URL. The caller then
 * saves the URL onto equipment.photo_url.
 */
export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaffOrManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const form = await request.formData()
  const file = form.get('photo')
  const equipmentId = String(form.get('equipment_id') ?? '').trim()
  if (!equipmentId) return NextResponse.json({ error: 'Missing equipment_id' }, { status: 400 })
  if (!file || !(file instanceof File)) return NextResponse.json({ error: 'Missing photo file' }, { status: 400 })
  if (file.type && !ALLOWED.has(file.type)) {
    return NextResponse.json({ error: 'Photo must be JPEG, PNG, or WebP' }, { status: 400 })
  }

  const raw = Buffer.from(await file.arrayBuffer())
  if (raw.length > MAX_BYTES) {
    return NextResponse.json({ error: 'Photo must be 8 MB or smaller' }, { status: 400 })
  }

  let out: Buffer
  let ext: string
  let contentType: string
  try {
    const img = sharp(raw).rotate()
    const meta = await img.metadata()
    const pipeline = img.resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
    if (meta.hasAlpha) {
      out = await pipeline.png({ compressionLevel: 9 }).toBuffer()
      ext = 'png'
      contentType = 'image/png'
    } else {
      out = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer()
      ext = 'jpg'
      contentType = 'image/jpeg'
    }
  } catch {
    return NextResponse.json({ error: 'Could not process this image' }, { status: 400 })
  }

  const path = `${equipmentId}/${Date.now()}.${ext}`
  const { error: upErr } = await service.storage
    .from('equipment-photos')
    .upload(path, out, { contentType, upsert: false })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: pub } = service.storage.from('equipment-photos').getPublicUrl(path)
  return NextResponse.json({ path, publicUrl: pub.publicUrl })
}
