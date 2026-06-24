import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

const BUCKET = 'school-logos'
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
type Format = 'jpg' | 'png' | 'eps'

const CONTENT_TYPE: Record<Format, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  eps: 'application/postscript',
}

function normalizeFormat(value: string | null | undefined): Format | null {
  const v = (value || '').trim().toLowerCase()
  if (v === 'jpg' || v === 'jpeg') return 'jpg'
  if (v === 'png') return 'png'
  if (v === 'eps') return 'eps'
  return null
}

// Light magic-byte sniff so the stored extension matches the actual bytes.
function bytesMatchFormat(bytes: Uint8Array, format: Format): boolean {
  if (format === 'png') {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  }
  if (format === 'jpg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  // EPS: ASCII "%!PS" header, or the DOS/binary EPS marker C5 D0 D3 C6.
  const ascii = bytes[0] === 0x25 && bytes[1] === 0x21 && bytes[2] === 0x50 && bytes[3] === 0x53
  const binary = bytes[0] === 0xc5 && bytes[1] === 0xd0 && bytes[2] === 0xd3 && bytes[3] === 0xc6
  return ascii || binary
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
  const format = normalizeFormat(String(form.get('format') || ''))

  if (!(file instanceof Blob)) return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  if (!code) return NextResponse.json({ error: 'Missing school code' }, { status: 400 })
  if (!format) return NextResponse.json({ error: 'Format must be jpg, png, or eps' }, { status: 400 })
  if (file.size === 0) return NextResponse.json({ error: 'File is empty' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File is larger than 10 MB' }, { status: 400 })

  // The code must match an existing, active school.
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
  if (!bytesMatchFormat(bytes, format)) {
    return NextResponse.json({ error: `File does not look like a valid ${format.toUpperCase()}` }, { status: 400 })
  }

  const path = `${code}.${format}`
  const { error: uploadErr } = await service.storage.from(BUCKET).upload(path, bytes, {
    upsert: true,
    contentType: CONTENT_TYPE[format],
  })
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  const url = service.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  return NextResponse.json({ success: true, code, format, url })
}

export async function DELETE(request: Request) {
  const manager = await requireManager()
  if (!manager) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const params = new URL(request.url).searchParams
  const code = String(params.get('code') || '').trim()
  const format = normalizeFormat(params.get('format'))

  if (!code) return NextResponse.json({ error: 'Missing school code' }, { status: 400 })
  if (!format) return NextResponse.json({ error: 'Format must be jpg, png, or eps' }, { status: 400 })

  const { error } = await service.storage.from(BUCKET).remove([`${code}.${format}`])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, code, format })
}
