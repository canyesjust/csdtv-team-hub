import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isStaffOrManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { BUILTIN_QR_PRESET_KEYS } from '@/lib/board-meetings/qr-presets'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaffOrManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { id } = await params
  const { data: existing } = await service.from('qr_presets').select('key').eq('id', id).maybeSingle()

  const body = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.label !== undefined) patch.label = body.label
  if (body.url_template !== undefined) patch.url_template = body.url_template
  if (body.description !== undefined) patch.description = body.description
  if (body.sort_order !== undefined) patch.sort_order = body.sort_order
  if (body.key !== undefined && existing && !BUILTIN_QR_PRESET_KEYS.has(existing.key)) {
    patch.key = body.key
  }

  const { data, error } = await service.from('qr_presets').update(patch).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ preset: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaffOrManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { id } = await params
  const { data: existing } = await service.from('qr_presets').select('key').eq('id', id).maybeSingle()
  if (existing && BUILTIN_QR_PRESET_KEYS.has(existing.key)) {
    return NextResponse.json({ error: 'Cannot delete built-in preset' }, { status: 400 })
  }

  const { error } = await service.from('qr_presets').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
