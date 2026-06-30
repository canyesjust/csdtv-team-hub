import { NextRequest, NextResponse } from 'next/server'
import { requireSignageEditorApi } from '@/lib/signage/server-auth'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

const now = () => new Date().toISOString()

export async function GET() {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { service } = auth
  const { data } = await service.from('signage_board_takeover').select('*').eq('id', 1).maybeSingle()
  return NextResponse.json({ takeover: data })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const action = String(body.action || '')

  // Keep-alive: the control surface pings this while it's open so the takeover
  // stays "fresh." If pings stop (console closed / operator forgot), the screen
  // feed treats the takeover as stale and screens return to normal on their own.
  // It only bumps a timestamp on an already-active takeover, so any authenticated
  // team member (e.g. an intern running the console) is allowed to send it.
  if (action === 'keepalive') {
    const teamUser = await getAuthenticatedTeamUser()
    if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const svc = getServiceSupabaseClient()
    if (!svc) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    await svc.from('signage_board_takeover').update({ heartbeat_at: now() }).eq('id', 1).eq('active', true)
    return NextResponse.json({ success: true })
  }

  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { service } = auth

  if (action === 'off') {
    const { error } = await service.from('signage_board_takeover').update({ active: false, updated_at: now() }).eq('id', 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  const channel = Number(body.board_channel_number)
  if (!Number.isFinite(channel) || channel < 1) {
    return NextResponse.json({ error: 'Enter a valid board channel number.' }, { status: 400 })
  }
  const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : null

  if (action === 'preroll') {
    const { error } = await service.from('signage_board_takeover').update({
      active: true, mode: 'preroll', board_channel_number: channel, label, updated_at: now(), heartbeat_at: now(),
    }).eq('id', 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  if (action === 'live') {
    // Pull the YouTube URL from the channel's assigned board meeting production.
    const { data: ch } = await service.from('output_channels').select('id').eq('channel_number', channel).maybeSingle()
    if (!ch) return NextResponse.json({ error: 'No board channel with that number.' }, { status: 400 })
    const { data: assign } = await service.from('channel_assignments').select('board_meeting_id').eq('output_channel_id', ch.id).is('unassigned_at', null).maybeSingle()
    if (!assign?.board_meeting_id) return NextResponse.json({ error: 'No board meeting is assigned to that channel.' }, { status: 400 })
    const { data: bm } = await service.from('board_meetings').select('production_id').eq('id', assign.board_meeting_id).maybeSingle()
    const prodRes = bm?.production_id
      ? await service.from('productions').select('livestream_url, title').eq('id', bm.production_id).maybeSingle()
      : { data: null }
    const youtube = prodRes.data?.livestream_url?.trim()
    if (!youtube) {
      return NextResponse.json({ error: 'That meeting has no livestream URL on its production yet. Add one, then go live.' }, { status: 400 })
    }
    const { error } = await service.from('signage_board_takeover').update({
      active: true, mode: 'live', board_channel_number: channel, youtube_url: youtube,
      label: label || prodRes.data?.title || null, updated_at: now(), heartbeat_at: now(),
    }).eq('id', 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true, youtube_url: youtube })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
