import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runWeeklyBackup } from '@/lib/weekly-backup/run-backup'
import { verifyCronBearer } from '@/lib/server/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Weekly compressed JSON backup to Supabase Storage (team-hub-backups).
 * Scheduled: Supabase pg_cron → weekly-backup-cron edge function (see db/weekly_backup_cron.sql).
 * Sunday ~2:00 AM America/Denver (9:00 UTC cron).
 */
export async function GET(request: Request) {
  if (process.env.WEEKLY_BACKUP_DISABLED === '1') {
    return NextResponse.json({ ok: false, skipped: true, reason: 'WEEKLY_BACKUP_DISABLED' })
  }

  if (!verifyCronBearer(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const supabase = createClient(url, key)
  const result = await runWeeklyBackup(supabase)

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, runId: result.runId }, { status: 500 })
  }

  if ('skipped' in result && result.skipped) {
    return NextResponse.json({ ok: true, skipped: true, reason: result.reason })
  }

  return NextResponse.json({
    ok: true,
    runId: result.runId,
    fileName: result.fileName,
    sizeBytes: result.sizeBytes,
  })
}
