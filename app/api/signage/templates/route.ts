import { NextRequest, NextResponse } from 'next/server'
import { requireManagerApi, requireSignageEditorApi } from '@/lib/signage/server-auth'

export const dynamic = 'force-dynamic'

const TEMPLATE_COLUMNS = 'id, name, description, category, kind, config, thumbnail_url, auto_rebrand, singleton, requires_url, all_sites, active, sort_order'

// GET ?site=<id>  → templates available to a location (school Content page)
// GET ?admin=1    → all templates + their assigned site ids (admin library page)
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const admin = url.searchParams.get('admin') === '1'
  const siteId = (url.searchParams.get('site') || '').trim()

  if (admin) {
    const auth = await requireManagerApi()
    if ('error' in auth) return auth.error
    const { service } = auth
    const [tplRes, asgRes] = await Promise.all([
      service.from('signage_templates').select(TEMPLATE_COLUMNS).order('sort_order').order('name'),
      service.from('signage_template_assignments').select('template_id, site_id'),
    ])
    const bySite = new Map<string, string[]>()
    for (const a of asgRes.data ?? []) {
      const arr = bySite.get(a.template_id) ?? []
      arr.push(a.site_id)
      bySite.set(a.template_id, arr)
    }
    const templates = (tplRes.data ?? []).map(t => ({ ...t, site_ids: bySite.get(t.id) ?? [] }))
    return NextResponse.json({ templates })
  }

  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { service } = auth
  if (!siteId) return NextResponse.json({ templates: [] })

  const { data: assigned } = await service.from('signage_template_assignments').select('template_id').eq('site_id', siteId)
  const assignedIds = (assigned ?? []).map(a => a.template_id)
  const { data: templates } = await service
    .from('signage_templates')
    .select(TEMPLATE_COLUMNS)
    .eq('active', true)
    .order('sort_order').order('name')
  // Available = global (all_sites) OR explicitly assigned to this location.
  const available = (templates ?? []).filter(t => t.all_sites || assignedIds.includes(t.id))
  return NextResponse.json({ templates: available })
}

// POST — create or update a template (+ set its site assignments). Admin only.
export async function POST(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const { service } = auth
  const body = await request.json().catch(() => ({})) as Record<string, unknown>

  const name = String(body.name ?? '').trim()
  const kind = String(body.kind ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const VALID_KINDS = ['broadcast_board', 'calendar', 'national_day', 'website', 'designed_slide', 'image', 'video']
  if (!VALID_KINDS.includes(kind)) return NextResponse.json({ error: 'Invalid template kind' }, { status: 400 })

  const row = {
    name,
    description: body.description ? String(body.description) : null,
    category: body.category ? String(body.category) : 'Live',
    kind,
    config: (body.config && typeof body.config === 'object') ? body.config : {},
    thumbnail_url: body.thumbnail_url ? String(body.thumbnail_url) : null,
    auto_rebrand: body.auto_rebrand !== false,
    singleton: body.singleton === true,
    requires_url: body.requires_url === true,
    all_sites: body.all_sites === true,
    active: body.active !== false,
    sort_order: typeof body.sort_order === 'number' ? body.sort_order : 100,
  }

  const id = body.id ? String(body.id) : null
  let templateId = id
  if (id) {
    const { error } = await service.from('signage_templates').update(row).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  } else {
    const { data, error } = await service.from('signage_templates').insert(row).select('id').single()
    if (error || !data) return NextResponse.json({ error: error?.message || 'Create failed' }, { status: 400 })
    templateId = data.id
  }

  // Sync assignments when specific site_ids are provided (ignored when all_sites).
  if (templateId && Array.isArray(body.site_ids) && !row.all_sites) {
    const siteIds = (body.site_ids as unknown[]).map(String).filter(Boolean)
    await service.from('signage_template_assignments').delete().eq('template_id', templateId)
    if (siteIds.length) {
      await service.from('signage_template_assignments').insert(siteIds.map(site_id => ({ template_id: templateId, site_id })))
    }
  } else if (templateId && row.all_sites) {
    await service.from('signage_template_assignments').delete().eq('template_id', templateId)
  }

  return NextResponse.json({ id: templateId })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const { service } = auth
  const id = (new URL(request.url).searchParams.get('id') || '').trim()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { error } = await service.from('signage_templates').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
