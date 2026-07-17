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

// Change a logo's category and/or name in place (metadata only; the stored file
// does not move). Updates all formats of the logo identity.
export async function PATCH(request: Request) {
  const manager = await requireManager()
  if (!manager) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as {
    code?: string; category?: string; name?: string; newCategory?: string; newName?: string; notes?: string
  }
  const code = String(body.code || '').trim()
  const category = String(body.category || '').trim()
  const name = String(body.name || '').trim()
  const newCategory = (String(body.newCategory ?? category).trim() || category).slice(0, 60)
  const newName = (String(body.newName ?? name).trim() || name).slice(0, 120)

  if (!code || !category || !name) {
    return NextResponse.json({ error: 'Missing code, category, or name' }, { status: 400 })
  }

  const renaming = newCategory !== category || newName !== name
  const setNotes = body.notes !== undefined
  if (!renaming && !setNotes) {
    return NextResponse.json({ success: true })
  }

  // Renaming onto an existing category+name MERGES (e.g. a JPG joins the matching PNG),
  // which is allowed as long as the formats do not collide (can't have two PNGs).
  if (renaming) {
    const { data: srcRows } = await service
      .from('school_logos')
      .select('format')
      .eq('school_code', code)
      .eq('category', category)
      .eq('name', name)
    const srcFormats = new Set(((srcRows ?? []) as { format: string }[]).map((r) => r.format))

    const { data: tgtRows } = await service
      .from('school_logos')
      .select('format')
      .eq('school_code', code)
      .eq('category', newCategory)
      .eq('name', newName)
    const tgtFormats = new Set(((tgtRows ?? []) as { format: string }[]).map((r) => r.format))

    if ([...srcFormats].some((f) => tgtFormats.has(f))) {
      return NextResponse.json({ error: 'That category and name already has the same file format. Rename one of them differently.' }, { status: 409 })
    }
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (renaming) { updates.category = newCategory; updates.name = newName }
  if (setNotes) updates.notes = String(body.notes || '').trim().slice(0, 600) || null

  const { error } = await service
    .from('school_logos')
    .update(updates)
    .eq('school_code', code)
    .eq('category', category)
    .eq('name', name)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, category: newCategory, name: newName })
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
  const format = formatRaw === 'png' || formatRaw === 'jpg' || formatRaw === 'svg' || formatRaw === 'docx' || formatRaw === 'eps' ? formatRaw : null
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
