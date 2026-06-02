import { NextResponse } from 'next/server'
import {
  assertActorNotImpersonating,
  getAuthenticatedTeamUser,
  isManagerRole,
} from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import {
  finalizeDistrictSyncSession,
  getDistrictSyncSession,
  listPendingDistrictRemovals,
} from '@/lib/district-sync-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const session = await getDistrictSyncSession(service)
  const pending = await listPendingDistrictRemovals(service)
  return NextResponse.json({ session, pending, pendingCount: pending.length })
}

export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const impersonating = await assertActorNotImpersonating()
  if (!impersonating.ok) return NextResponse.json({ error: impersonating.message }, { status: 403 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  let body: { action?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (body.action !== 'finalize') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  try {
    const result = await finalizeDistrictSyncSession(service)
    const pending = await listPendingDistrictRemovals(service)
    return NextResponse.json({
      ok: true,
      ...result,
      pendingCount: pending.length,
      pending,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Finalize failed' },
      { status: 500 },
    )
  }
}
