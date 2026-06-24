import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

const BUCKET = 'school-logos'
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
type Format = 'png' | 'jpg'

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
  const category = String(form.get('category') || '').trim().slice(0, 60)
  const name = String(form.get('name') || '').trim().slice(0, 120)

  if (!(file instanceof Blob)) return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  if (!code) return NextResponse.json({ error: 'Missing school code' }, { status: 400 })
  if (!category) return NextResponse.json({ error: 'Missing category' }, { status: 400 })
  if (!name) return NextResponse.json({ error: 'Missing logo name' }, { status: 400 })
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

  // Reuse the existing row/path for this exact name + category + format so re-upload replaces it.
  const { data: existing } = await service
    .from('school_logos')
    .select('id, storage_path')
    .eq('school_code', code)
    .eq('category', category)
    .eq('name', name)
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
    ? (await service.from('school_logos').update({ updated_at: new Date().toISOString() }).eq('id', existing.id)).error
    : (await service.from('school_logos').insert({ id, school_code: code, category, name, format, storage_path: storagePath })).error
  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 })

  return NextResponse.json({ success: true, code, category, name, format })
}

export async function DELETE(request: Request) {
  const manager = await requireManager()
  if (!manager) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const params = new URL(request.url).searchParams
  const code = String(params.get('code') || '').trim()
  const category = String(params.get('category') || '').trim()
  const name = String(params.get('name') || '').trim()
  const formatRaw = String(params.get('format') || '').trim()
  const format = formatRaw === 'png' || formatRaw === 'jpg' ? formatRaw : null
  if (!code || !category || !name || !format) {
    return NextResponse.json({ error: 'Missing code, category, name, or format' }, { status: 400 })
  }

  const { data: row, error: findErr } = await service
    .from('school_logos')
    .select('id, storage_path')
    .eq('school_code', code)
    .eq('category', category)
    .eq('name', name)
    .eq('format', format)
    .maybeSingle()
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Logo not found' }, { status: 404 })

  await service.storage.from(BUCKET).remove([row.storage_path])
  const { error: delErr } = await service.from('school_logos').delete().eq('id', row.id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
