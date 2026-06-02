import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { setOutputChannelObsPolling } from '@/lib/board-meetings/broadcast-control'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  if (typeof body?.obs_polling_enabled !== 'boolean') {
    return NextResponse.json({ error: 'obs_polling_enabled (boolean) required' }, { status: 400 })
  }

  try {
    await setOutputChannelObsPolling(service, id, body.obs_polling_enabled)
    return NextResponse.json({ success: true, obs_polling_enabled: body.obs_polling_enabled })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Update failed' }, { status: 500 })
  }
}
