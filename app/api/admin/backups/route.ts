import { NextResponse } from 'next/server'
import { getActorTeamUser, isManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { runWeeklyBackup } from '@/lib/weekly-backup/run-backup'

export const dynamic = 'force-dynamic'

export async function GET() {
  const actor = await getActorTeamUser()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerRole(actor.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data, error } = await service
    .from('backup_runs')
    .select('id, created_at, completed_at, file_name, size_bytes, status, error_message, row_counts')
    .order('created_at', { ascending: false })
    .limit(8)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ backups: data || [] })
}

export async function POST(request: Request) {
  const actor = await getActorTeamUser()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerRole(actor.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  if (body.action !== 'run') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const result = await runWeeklyBackup(service, { force: body.force === true })

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
