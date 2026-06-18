import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

const VALID = new Set(['classic', 'soft', 'triad', 'ding', 'custom'])

// Public: the dais/console (and the public output pages) read which bell to play.
export async function GET() {
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ choice: 'classic', custom_url: null })
  const { data } = await service.from('board_bell_settings').select('choice, custom_url').eq('id', 1).maybeSingle()
  return NextResponse.json({
    choice: data?.choice ?? 'classic',
    custom_url: data?.custom_url ?? null,
  })
}

// Set the station bell choice (and optional custom sound URL).
export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const choice = String(body.choice || 'classic')
  if (!VALID.has(choice)) return NextResponse.json({ error: 'Invalid bell choice' }, { status: 400 })
  const customUrl = body.custom_url == null ? null : String(body.custom_url)
  if (choice === 'custom' && !customUrl) {
    return NextResponse.json({ error: 'Upload a sound first to use a custom bell.' }, { status: 400 })
  }

  const { error } = await service
    .from('board_bell_settings')
    .update({ choice, custom_url: customUrl, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
