import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isStaffOrManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

const KINDS = ['vo', 'stinger', 'bed', 'sfx']
const ALLOWED_MIME = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/ogg']
const MAX_BYTES = 60 * 1024 * 1024

async function requireStaff() {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!isStaffOrManagerRole(teamUser.role)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const service = getServiceSupabaseClient()
  if (!service) return { error: NextResponse.json({ error: 'Server configuration error' }, { status: 500 }) }
  return { service }
}

export async function GET() {
  const gate = await requireStaff()
  if ('error' in gate) return gate.error
  const { data } = await gate.service
    .from('graphics_audio_assets')
    .select('id, name, kind, duration_seconds, mime_type, file_size_bytes')
    .order('name')
  return NextResponse.json({ assets: data || [] })
}

/** Upload the file, then register it. Bounded on type and size server-side. */
export async function POST(request: Request) {
  const gate = await requireStaff()
  if ('error' in gate) return gate.error
  const { service } = gate

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Expected a file upload' }, { status: 400 })

  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That file is over 60 MB' }, { status: 400 })
  if (!ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported type ${file.type}` }, { status: 400 })
  }

  const name = String(form.get('name') || file.name).slice(0, 160)
  const kindRaw = String(form.get('kind') || 'vo')
  const kind = KINDS.includes(kindRaw) ? kindRaw : 'vo'
  const duration = Number(form.get('duration_seconds'))

  const ext = (file.name.split('.').pop() || 'mp3').replace(/[^a-z0-9]/gi, '').slice(0, 5)
  const path = `${crypto.randomUUID()}.${ext}`

  const { error: upErr } = await service.storage
    .from('graphics-audio')
    .upload(path, file, { contentType: file.type, upsert: false })
  if (upErr) return NextResponse.json({ error: 'Could not store the file' }, { status: 500 })

  const { data, error } = await service
    .from('graphics_audio_assets')
    .insert({
      name, kind, storage_path: path, mime_type: file.type,
      duration_seconds: Number.isFinite(duration) && duration > 0 ? duration : null,
      file_size_bytes: file.size,
    })
    .select('id').single()
  if (error) {
    await service.storage.from('graphics-audio').remove([path])
    return NextResponse.json({ error: 'Could not save the asset' }, { status: 500 })
  }
  return NextResponse.json({ success: true, id: data.id })
}
