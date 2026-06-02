import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { BUILTIN_QR_PRESET_KEYS } from '@/lib/board-meetings/qr-presets'

export const dynamic = 'force-dynamic'

export async function GET() {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data, error } = await service.from('qr_presets').select('*').order('sort_order', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ presets: data || [] })
}

export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  if (!body?.key || !body?.label) {
    return NextResponse.json({ error: 'key and label required' }, { status: 400 })
  }
  const key = String(body.key).trim()
  if (!/^[a-z][a-z0-9_]*$/.test(key)) {
    return NextResponse.json(
      { error: 'Key must be lowercase letters, numbers, and underscores (start with a letter)' },
      { status: 400 },
    )
  }
  if (BUILTIN_QR_PRESET_KEYS.has(key)) {
    return NextResponse.json({ error: 'That key is reserved for a built-in preset' }, { status: 400 })
  }

  const { data, error } = await service
    .from('qr_presets')
    .insert({
      key,
      label: body.label,
      url_template: body.url_template ?? null,
      description: body.description ?? null,
      sort_order: body.sort_order ?? 0,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ preset: data })
}
