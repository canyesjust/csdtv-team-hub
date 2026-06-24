import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

const BUCKET = 'school-logos'

// Step 2 of a logo upload: after the browser uploaded directly to storage, record
// (or replace) the school_logos row. Verifies the object exists before saving.
export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser || !isManagerRole(teamUser.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as { code?: string; category?: string; name?: string; format?: string; path?: string }
  const code = String(body.code || '').trim()
  const category = String(body.category || '').trim().slice(0, 60)
  const name = String(body.name || '').trim().slice(0, 120)
  const format = body.format === 'png' || body.format === 'jpg' ? body.format : null
  const path = String(body.path || '')

  if (!code || !category || !name || !format) {
    return NextResponse.json({ error: 'Missing code, category, name, or format' }, { status: 400 })
  }
  if (!path.startsWith(`${code}/`) || !path.endsWith(`.${format}`)) {
    return NextResponse.json({ error: 'Invalid upload path' }, { status: 400 })
  }

  // Confirm the uploaded object is really there.
  const dir = path.split('/').slice(0, -1).join('/')
  const base = path.split('/').pop()
  const { data: listed } = await service.storage.from(BUCKET).list(dir, { search: base })
  if (!base || !listed?.some((o) => o.name === base)) {
    return NextResponse.json({ error: 'Upload not found in storage' }, { status: 400 })
  }

  const { data: existing } = await service
    .from('school_logos')
    .select('id, storage_path')
    .eq('school_code', code)
    .eq('category', category)
    .eq('name', name)
    .eq('format', format)
    .maybeSingle()

  if (existing) {
    if (existing.storage_path && existing.storage_path !== path) {
      await service.storage.from(BUCKET).remove([existing.storage_path])
    }
    const { error } = await service
      .from('school_logos')
      .update({ storage_path: path, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await service
      .from('school_logos')
      .insert({ school_code: code, category, name, format, storage_path: path })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, code, category, name, format })
}
