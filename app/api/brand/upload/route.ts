import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

const BUCKET = 'school-logos'
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

const TYPES = ['logo', 'seal', 'mascot'] as const
const COLORS = ['full', 'white', 'black'] as const
const ORIENTATIONS = ['horizontal', 'stacked', 'icon'] as const
type Format = 'png' | 'jpg'

function inOne<T extends string>(value: string, set: readonly T[]): T | null {
  return (set as readonly string[]).includes(value) ? (value as T) : null
}

// Detect png/jpg from magic bytes so the stored format matches the bytes.
function sniffFormat(bytes: Uint8Array): Format | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  return null
}

async function requireManager() {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser || !isManagerRole(teamUser.role)) return null
  return teamUser
}

export async function POST(request: Request) {
  const manager = await requireManager()
  if (!manager) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 })
  }

  const file = form.get('file')
  const code = String(form.get('code') || '').trim()
  const type = inOne(String(form.get('type') || ''), TYPES)
  const color = inOne(String(form.get('color') || ''), COLORS)
  const orientation = inOne(String(form.get('orientation') || ''), ORIENTATIONS)
  const labelRaw = String(form.get('label') || '').trim()
  const label = labelRaw ? labelRaw.slice(0, 120) : null

  if (!(file instanceof Blob)) return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  if (!code) return NextResponse.json({ error: 'Missing school code' }, { status: 400 })
  if (!type) return NextResponse.json({ error: 'Type must be logo, seal, or mascot' }, { status: 400 })
  if (!color) return NextResponse.json({ error: 'Color must be full, white, or black' }, { status: 400 })
  if (!orientation) return NextResponse.json({ error: 'Orientation must be horizontal, stacked, or icon' }, { status: 400 })
  if (file.size === 0) return NextResponse.json({ error: 'File is empty' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File is larger than 10 MB' }, { status: 400 })

  const { data: school, error: schoolErr } = await service
    .from('schools')
    .select('code')
    .eq('code', code)
    .eq('type', 'school')
    .not('active', 'is', false)
    .maybeSingle()
  if (schoolErr) return NextResponse.json({ error: schoolErr.message }, { status: 500 })
  if (!school) return NextResponse.json({ error: 'Unknown school code' }, { status: 400 })

  const bytes = new Uint8Array(await file.arrayBuffer())
  const format = sniffFormat(bytes)
  if (!format) return NextResponse.json({ error: 'File must be a PNG or JPG' }, { status: 400 })

  // Reuse the existing row/path for this exact combination so a re-upload replaces it.
  const { data: existing } = await service
    .from('school_logos')
    .select('id, storage_path')
    .eq('school_code', code)
    .eq('type', type)
    .eq('color', color)
    .eq('orientation', orientation)
    .eq('format', format)
    .maybeSingle()

  const id = existing?.id || randomUUID()
  const storagePath = existing?.storage_path || `${code}/${id}.${format}`

  const { error: uploadErr } = await service.storage.from(BUCKET).upload(storagePath, bytes, {
    upsert: true,
    contentType: format === 'png' ? 'image/png' : 'image/jpeg',
  })
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  const rowErr = existing
    ? (await service
        .from('school_logos')
        .update({ label, updated_at: new Date().toISOString() })
        .eq('id', existing.id)).error
    : (await service
        .from('school_logos')
        .insert({ id, school_code: code, type, color, orientation, format, label, storage_path: storagePath })).error

  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 })

  return NextResponse.json({ success: true, id, code, type, color, orientation, format })
}

export async function DELETE(request: Request) {
  const manager = await requireManager()
  if (!manager) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const params = new URL(request.url).searchParams
  const code = String(params.get('code') || '').trim()
  const type = inOne(String(params.get('type') || ''), TYPES)
  const color = inOne(String(params.get('color') || ''), COLORS)
  const orientation = inOne(String(params.get('orientation') || ''), ORIENTATIONS)
  const format = inOne(String(params.get('format') || ''), ['png', 'jpg'] as const)
  if (!code || !type || !color || !orientation || !format) {
    return NextResponse.json({ error: 'Missing code, type, color, orientation, or format' }, { status: 400 })
  }

  const { data: row, error: findErr } = await service
    .from('school_logos')
    .select('id, storage_path')
    .eq('school_code', code)
    .eq('type', type)
    .eq('color', color)
    .eq('orientation', orientation)
    .eq('format', format)
    .maybeSingle()
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Logo not found' }, { status: 404 })

  await service.storage.from(BUCKET).remove([row.storage_path])
  const { error: delErr } = await service.from('school_logos').delete().eq('id', row.id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
