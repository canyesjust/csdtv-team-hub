import type { SupabaseClient } from '@supabase/supabase-js'
import { buildBackupArchive } from '@/lib/weekly-backup/build-archive'
import { BACKUP_BUCKET, BACKUP_RETENTION_COUNT } from '@/lib/weekly-backup/tables'

function backupFileName(createdAt: Date): string {
  const y = createdAt.getUTCFullYear()
  const m = String(createdAt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(createdAt.getUTCDate()).padStart(2, '0')
  return `team-hub-backup-${y}-${m}-${d}.json.gz`
}

async function notifyManagers(supabase: SupabaseClient, fileName: string) {
  const { data: managers } = await supabase
    .from('team')
    .select('id')
    .eq('role', 'Manager')
    .eq('active', true)

  if (!managers?.length) return

  const title = 'Weekly backup ready'
  const body = `${fileName} is available in Settings → Backups.`
  const action_url = '/dashboard/settings?tab=backups'

  await supabase.from('notifications').insert(
    managers.map(m => ({
      user_id: m.id,
      type: 'weekly_backup',
      title,
      body,
      action_url,
      read: false,
    })),
  )
}

async function pruneOldBackups(supabase: SupabaseClient) {
  const { data: completed } = await supabase
    .from('backup_runs')
    .select('id, storage_path')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })

  if (!completed || completed.length <= BACKUP_RETENTION_COUNT) return

  const toRemove = completed.slice(BACKUP_RETENTION_COUNT)
  const paths = toRemove.map(r => r.storage_path).filter(Boolean)
  if (paths.length > 0) {
    await supabase.storage.from(BACKUP_BUCKET).remove(paths)
  }
  await supabase.from('backup_runs').delete().in(
    'id',
    toRemove.map(r => r.id),
  )
}

export type RunWeeklyBackupResult =
  | { ok: true; runId: string; fileName: string; sizeBytes: number; skipped?: false }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string; runId?: string }

/** Skip if a completed backup finished within the last 6 days (weekly cadence). */
async function recentCompletedBackupExists(supabase: SupabaseClient): Promise<boolean> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 6)
  const { data } = await supabase
    .from('backup_runs')
    .select('id')
    .eq('status', 'completed')
    .gte('completed_at', cutoff.toISOString())
    .limit(1)
  return (data?.length ?? 0) > 0
}

export async function runWeeklyBackup(
  supabase: SupabaseClient,
  options?: { force?: boolean },
): Promise<RunWeeklyBackupResult> {
  if (!options?.force && (await recentCompletedBackupExists(supabase))) {
    return { ok: true, skipped: true, reason: 'completed_within_last_6_days' }
  }

  const { data: running } = await supabase
    .from('backup_runs')
    .select('id')
    .eq('status', 'running')
    .limit(1)
  if (running?.length) {
    return { ok: true, skipped: true, reason: 'backup_already_running' }
  }

  const startedAt = new Date()
  const fileName = backupFileName(startedAt)
  const storagePath = `weekly/${fileName}`

  const { data: runRow, error: insertErr } = await supabase
    .from('backup_runs')
    .insert({
      storage_path: storagePath,
      file_name: fileName,
      status: 'running',
      row_counts: {},
    })
    .select('id')
    .single()

  if (insertErr || !runRow) {
    return { ok: false, error: insertErr?.message || 'Could not create backup run' }
  }

  const runId = runRow.id as string

  try {
    const { archiveBytes, rowCounts } = await buildBackupArchive(supabase)

    const { error: uploadErr } = await supabase.storage
      .from(BACKUP_BUCKET)
      .upload(storagePath, archiveBytes, {
        contentType: 'application/gzip',
        upsert: false,
      })

    if (uploadErr) {
      await supabase
        .from('backup_runs')
        .update({
          status: 'failed',
          error_message: uploadErr.message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', runId)
      return { ok: false, error: uploadErr.message, runId }
    }

    const sizeBytes = archiveBytes.byteLength
    const completedAt = new Date().toISOString()

    await supabase
      .from('backup_runs')
      .update({
        status: 'completed',
        size_bytes: sizeBytes,
        row_counts: rowCounts,
        completed_at: completedAt,
        error_message: null,
      })
      .eq('id', runId)

    await notifyManagers(supabase, fileName)
    await pruneOldBackups(supabase)

    return { ok: true, runId, fileName, sizeBytes }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Backup failed'
    await supabase
      .from('backup_runs')
      .update({
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId)
    return { ok: false, error: message, runId }
  }
}
