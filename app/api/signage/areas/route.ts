import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireSignageEditorApi } from '@/lib/signage/server-auth'
import { slugify } from '@/lib/signage/slug'

export const dynamic = 'force-dynamic'

/**
 * Area slugs are GLOBALLY unique, so the manual "Add area" form no longer makes
 * the user craft one by hand. We build it from the name, prefix it with the
 * site slug (so "Front Office" at two schools don't collide), and append -2/-3
 * only if that exact slug is somehow still taken.
 */
async function uniqueAreaSlug(service: SupabaseClient, base: string, excludeId?: string): Promise<string> {
  const root = base || 'area'
  let candidate = root
  let n = 2
  // Bounded loop so a pathological case can never hang the request.
  for (let i = 0; i < 200; i++) {
    let q = service.from('signage_areas').select('id').eq('slug', candidate).limit(1)
    if (excludeId) q = q.neq('id', excludeId)
    const { data } = await q
    if (!data || data.length === 0) return candidate
    candidate = `${root}-${n++}`
  }
  return `${root}-${Date.now()}`
}

export async function POST(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { service } = auth
  const body = await request.json()
  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  // Base slug from whatever the form sent (name-derived), then location-prefixed.
  let base = slugify(body.slug || body.name)
  if (body.site_id) {
    const { data: site } = await service.from('signage_sites').select('slug').eq('id', body.site_id).maybeSingle()
    const siteSlug = slugify(site?.slug || '')
    if (siteSlug && base !== siteSlug && !base.startsWith(`${siteSlug}-`)) base = `${siteSlug}-${base}`
  }
  const slug = await uniqueAreaSlug(service, base)

  const { data, error } = await service.from('signage_areas').insert({
    name: body.name,
    site_id: body.site_id || null,
    building: body.building || null,
    floor: body.floor ?? null,
    slug,
    sort_order: body.sort_order ?? 0,
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ area: data })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { service } = auth
  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const slug = body.slug !== undefined
    ? await uniqueAreaSlug(service, slugify(body.slug || body.name || ''), body.id)
    : undefined
  const { data, error } = await service.from('signage_areas').update({
    name: body.name,
    building: body.building,
    floor: body.floor,
    ...(slug !== undefined ? { slug } : {}),
    sort_order: body.sort_order,
  }).eq('id', body.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ area: data })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { service } = auth
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await service.from('signage_areas').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
