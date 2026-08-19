import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { canManageCalendarQueue } from '@/lib/calendar-access'
import { runCalendarSync } from '@/lib/server/calendar-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Manual "sync now" trigger for a calendar approver, from
 * /dashboard/calendar/feeds. Runs the same logic as the scheduled cron
 * (lib/server/calendar-sync.ts). Optional JSON body { feedId } syncs just one
 * school's feed instead of all of them. { feedId, allowMassRemoval: true }
 * overrides the mass-removal guard for that one feed -- used by the
 * "Confirm removal" action after a human has reviewed the candidate list a
 * prior sync returned.
 */
export async function POST(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data: row } = await service.from('team').select('calendar_approver').eq('id', teamUser.id).maybeSingle()
  if (!isManagerRole(teamUser.role) && !canManageCalendarQueue(row?.calendar_approver)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let feedId: string | undefined
  let allowMassRemoval = false
  try {
    const body = await request.json()
    if (body && typeof body.feedId === 'string') feedId = body.feedId
    // Only meaningful alongside a specific feedId -- a human reviewed that
    // one feed's massRemovalCandidates from a prior sync and confirmed it's
    // real. Ignored entirely for an all-feeds sync.
    if (body && body.allowMassRemoval === true) allowMassRemoval = true
  } catch {
    // No body / not JSON -- sync all feeds.
  }

  const summary = await runCalendarSync(feedId ? { feedId, allowMassRemoval } : undefined)
  if ('error' in summary) {
    return NextResponse.json({ error: summary.error }, { status: 500 })
  }
  return NextResponse.json(summary)
}
