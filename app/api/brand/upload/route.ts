import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

// Uploads go through /api/brand/upload/sign + /finalize (direct-to-storage).
// This route only handles deletion of a single logo file by its natural key.
export const dynamic = 'force-dynamic'

const BUCKET = 'school-logos'

async function requireManager() {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser || !isManagerRole(teamUser.role)) return null
  return teamUser
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
