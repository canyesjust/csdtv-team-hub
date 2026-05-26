import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import {
  isOutlookIcalConfigured,
  readSignageOutlookEnabled,
  writeSignageOutlookEnabled,
} from '@/lib/signage-outlook-settings'

export const dynamic = 'force-dynamic'

export async function GET() {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const configured = isOutlookIcalConfigured()
  const service = getServiceSupabaseClient()
  const enabled = configured && service ? await readSignageOutlookEnabled(service) : false

  return NextResponse.json({ enabled, configured })
}

export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!isOutlookIcalConfigured()) {
    return NextResponse.json(
      { error: 'Outlook calendar is not configured (OUTLOOK_ICAL_URL missing on server).' },
      { status: 400 },
    )
  }

  const body = (await request.json().catch(() => null)) as { enabled?: boolean } | null
  if (typeof body?.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled (boolean) required' }, { status: 400 })
  }

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  await writeSignageOutlookEnabled(service, body.enabled)
  return NextResponse.json({ enabled: body.enabled, configured: true })
}
