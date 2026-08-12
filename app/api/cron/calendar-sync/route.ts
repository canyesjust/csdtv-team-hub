import { NextResponse } from 'next/server'
import { verifyCronBearer } from '@/lib/server/cron-auth'
import { runCalendarSync } from '@/lib/server/calendar-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Pulls every school's ICS feed into the review queue. See
 * lib/server/calendar-sync.ts for the actual sync logic (shared with the
 * staff-facing manual trigger at /api/calendar/sync-now).
 *
 * Auth: Authorization: Bearer <CRON_SECRET or SUPABASE_SERVICE_ROLE_KEY> (see
 * lib/server/cron-auth.ts). Intended caller: a Supabase scheduled Edge
 * Function (deployed via the dashboard, not this repo) on a pg_cron schedule,
 * mirroring the daily-staff-digest / weekly-backup cron pattern.
 */
export async function GET(request: Request) {
  if (!verifyCronBearer(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const summary = await runCalendarSync()
  if ('error' in summary) {
    return NextResponse.json({ error: summary.error }, { status: 500 })
  }
  return NextResponse.json(summary)
}

export async function POST(request: Request) {
  return GET(request)
}
