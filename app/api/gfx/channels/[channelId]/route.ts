import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isStaffOrManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function requireStaff() {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!isStaffOrManagerRole(teamUser.role)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const service = getServiceSupabaseClient()
  if (!service) return { error: NextResponse.json({ error: 'Server configuration error' }, { status: 500 }) }
  return { service }
}

/** Rig settings. Changed twice a year, from the Library. */
export async function PATCH(request: Request, { params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params
  if (!UUID.test(channelId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const gate = await requireStaff()
  if ('error' in gate) return gate.error

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim().slice(0, 80)
  if (typeof body.note === 'string') patch.note = body.note.slice(0, 200)
  if (typeof body.panel_enabled === 'boolean') patch.panel_enabled = body.panel_enabled
  if (typeof body.listening === 'boolean') patch.listening = body.listening

  // Rotating is the only recovery when a token has been on a screen share, so
  // it lives here rather than in a migration somebody has to ask for.
  if (body.action === 'rotate_control_token') {
    const bytes = new Uint8Array(24)
    crypto.getRandomValues(bytes)
    patch.control_token = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { error } = await gate.service.from('graphics_channels').update(patch).eq('id', channelId)
  if (error) return NextResponse.json({ error: 'Could not update the channel' }, { status: 500 })
  return NextResponse.json({ success: true })
}
