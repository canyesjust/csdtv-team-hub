import { NextResponse } from 'next/server'
import { getActorTeamUser, isManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { BACKUP_BUCKET } from '@/lib/weekly-backup/tables'

export const dynamic = 'force-dynamic'

const SIGNED_URL_TTL_SEC = 60 * 15

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getActorTeamUser()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerRole(actor.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data: run, error } = await service
    .from('backup_runs')
    .select('id, storage_path, file_name, status')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!run) return NextResponse.json({ error: 'Backup not found' }, { status: 404 })
  if (run.status !== 'completed') {
    return NextResponse.json({ error: 'Backup is not ready for download' }, { status: 400 })
  }

  const { data: signed, error: signErr } = await service.storage
    .from(BACKUP_BUCKET)
    .createSignedUrl(run.storage_path, SIGNED_URL_TTL_SEC, {
      download: run.file_name || 'team-hub-backup.json.gz',
    })

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: signErr?.message || 'Could not create download link' }, { status: 500 })
  }

  return NextResponse.json({
    url: signed.signedUrl,
    fileName: run.file_name,
    expiresInSeconds: SIGNED_URL_TTL_SEC,
  })
}
