import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isStaffOrManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaffOrManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const form = await request.formData()
  const file = form.get('photo')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Missing photo file' }, { status: 400 })
  }
  if (file.type && !ALLOWED.has(file.type)) {
    return NextResponse.json({ error: 'Photo must be JPEG, PNG, or WebP' }, { status: 400 })
  }
  const buf = Buffer.from(await file.arrayBuffer())
  if (buf.length > MAX_BYTES) {
    return NextResponse.json({ error: 'Photo must be 5 MB or smaller' }, { status: 400 })
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${teamUser.id}/${Date.now()}.${ext}`

  const { error: upErr } = await service.storage
    .from('lower-third-photos')
    .upload(path, buf, { contentType: file.type || 'image/jpeg', upsert: false })

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  const { data: pub } = service.storage.from('lower-third-photos').getPublicUrl(path)
  return NextResponse.json({ path, publicUrl: pub.publicUrl })
}
