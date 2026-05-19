import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

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

  const { data, error } = await service
    .from('qr_presets')
    .insert({
      key: body.key,
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
