import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { timingSafeEqualStr } from '@/lib/server/security'
import {
  normalizePaletteColors,
  syncSchoolColumnsFromPrimaryPalette,
  type Palette,
} from '@/lib/server/brand-palettes'

// Manage a school's brand color palettes: create, rename, edit colors, delete.
// Authorized for a logged-in manager OR a reviewer with the shared BRAND_REVIEW_KEY,
// same dual-auth pattern as /api/brand/upload/sign + /finalize.
export const dynamic = 'force-dynamic'

const MAX_PALETTE_NAME = 60
const PRIMARY = 'primary'

async function authorize(request: Request, body: { key?: string }): Promise<{ ok: true; isManager: boolean } | { ok: false }> {
  const teamUser = await getAuthenticatedTeamUser()
  const isManager = !!(teamUser && isManagerRole(teamUser.role))
  if (isManager) return { ok: true, isManager: true }

  const reviewKey = process.env.BRAND_REVIEW_KEY
  if (reviewKey && timingSafeEqualStr(body.key, reviewKey)) {
    const rl = await checkRateLimit(request, { scope: 'brand_palettes', max: 30, windowMs: 60 * 1000 })
    if (rl.limited) return { ok: false }
    return { ok: true, isManager: false }
  }
  return { ok: false }
}

async function schoolExists(service: ReturnType<typeof getServiceSupabaseClient>, code: string): Promise<boolean> {
  if (!service) return false
  const { data } = await service
    .from('schools')
    .select('code')
    .eq('code', code)
    .in('type', ['school', 'district', 'department'])
    .not('active', 'is', false)
    .maybeSingle()
  return !!data
}

export async function POST(request: Request) {
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as { code?: string; name?: string; key?: string }
  const auth = await authorize(request, body)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const code = String(body.code || '').trim()
  const name = String(body.name || '').trim().slice(0, MAX_PALETTE_NAME)
  if (!code) return NextResponse.json({ error: 'Missing school code' }, { status: 400 })
  if (!name) return NextResponse.json({ error: 'Palette name is required' }, { status: 400 })
  if (!(await schoolExists(service, code))) return NextResponse.json({ error: 'Unknown school code' }, { status: 400 })

  const { data: maxRow } = await service
    .from('school_brand_palettes')
    .select('sort_order')
    .eq('school_code', code)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextSort = (maxRow?.sort_order ?? -1) + 1

  const { data, error } = await service
    .from('school_brand_palettes')
    .insert({ school_code: code, name, sort_order: nextSort, colors: new Array(8).fill(null) })
    .select('id, school_code, name, sort_order, colors')
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: `A palette named "${name}" already exists for this school.` }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const palette: Palette = { id: data.id, schoolCode: data.school_code, name: data.name, sortOrder: data.sort_order, colors: data.colors }
  return NextResponse.json({ success: true, palette })
}

export async function PATCH(request: Request) {
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as { code?: string; id?: string; name?: string; colors?: unknown; key?: string }
  const auth = await authorize(request, body)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const code = String(body.code || '').trim()
  const id = String(body.id || '').trim()
  if (!code || !id) return NextResponse.json({ error: 'Missing code or palette id' }, { status: 400 })

  const { data: existing, error: findErr } = await service
    .from('school_brand_palettes')
    .select('id, school_code, name, colors')
    .eq('id', id)
    .eq('school_code', code)
    .maybeSingle()
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Palette not found' }, { status: 404 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  let renamedTo: string | null = null

  if (typeof body.name === 'string') {
    const name = body.name.trim().slice(0, MAX_PALETTE_NAME)
    if (!name) return NextResponse.json({ error: 'Palette name is required' }, { status: 400 })
    if (existing.name.toLowerCase() === PRIMARY && name.toLowerCase() !== PRIMARY) {
      return NextResponse.json({ error: 'The Primary palette cannot be renamed.' }, { status: 400 })
    }
    updates.name = name
    renamedTo = name
  }

  let normalizedColors: (string | null)[] | undefined
  if ('colors' in body) {
    normalizedColors = normalizePaletteColors(body.colors)
    if (!normalizedColors) {
      return NextResponse.json({ error: 'Colors must be hex values like #003087 or #abc (or blank to clear), up to 8 per palette.' }, { status: 400 })
    }
    updates.colors = normalizedColors
  }

  if (Object.keys(updates).length === 1) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { data: updated, error } = await service
    .from('school_brand_palettes')
    .update(updates)
    .eq('id', id)
    .select('id, school_code, name, sort_order, colors')
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: `A palette named "${renamedTo}" already exists for this school.` }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Keep the legacy schools.*_color columns (signage/admin settings/productions) in
  // sync with the Primary palette's first four slots whenever its colors change.
  if (normalizedColors && (existing.name.toLowerCase() === PRIMARY)) {
    await syncSchoolColumnsFromPrimaryPalette(service, code, normalizedColors)
  }

  const palette: Palette = { id: updated.id, schoolCode: updated.school_code, name: updated.name, sortOrder: updated.sort_order, colors: updated.colors }
  return NextResponse.json({ success: true, palette })
}

export async function DELETE(request: Request) {
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const params = new URL(request.url).searchParams
  const body = { code: params.get('code') || undefined, key: params.get('key') || undefined }
  const auth = await authorize(request, body)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const code = String(params.get('code') || '').trim()
  const id = String(params.get('id') || '').trim()
  if (!code || !id) return NextResponse.json({ error: 'Missing code or palette id' }, { status: 400 })

  const { data: existing } = await service
    .from('school_brand_palettes')
    .select('id, name')
    .eq('id', id)
    .eq('school_code', code)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Palette not found' }, { status: 404 })
  if (existing.name.toLowerCase() === PRIMARY) {
    return NextResponse.json({ error: 'The Primary palette cannot be removed.' }, { status: 400 })
  }

  const { error } = await service.from('school_brand_palettes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
