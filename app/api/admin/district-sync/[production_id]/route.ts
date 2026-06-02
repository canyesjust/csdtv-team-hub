import { NextResponse } from 'next/server'
import {
  assertActorNotImpersonating,
  getAuthenticatedTeamUser,
  isManagerRole,
} from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import {
  archiveDistrictRemoval,
  deleteProductionFromHub,
  dismissDistrictRemoval,
} from '@/lib/district-sync-server'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
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

  const action = body.action
  if (action !== 'archive' && action !== 'dismiss' && action !== 'delete') {
    return NextResponse.json({ error: 'action must be archive, dismiss, or delete' }, { status: 400 })
  }

  try {
    if (action === 'dismiss') await dismissDistrictRemoval(service, production_id)
    else if (action === 'archive') await archiveDistrictRemoval(service, production_id)
    else await deleteProductionFromHub(service, production_id)
    return NextResponse.json({ ok: true, action })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Action failed' },
      { status: 500 },
    )
  }
}
