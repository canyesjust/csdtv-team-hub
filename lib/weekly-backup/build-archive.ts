import { gzipSync } from 'zlib'
import { fetchTableRows } from '@/lib/weekly-backup/fetch-table'
import { BACKUP_TABLES } from '@/lib/weekly-backup/tables'
import type { SupabaseClient } from '@supabase/supabase-js'

export type BackupManifest = {
  version: 1
  format: 'json-gzip'
  created_at: string
  site_url: string | null
  tables: Record<string, { count: number; skipped?: boolean; error?: string }>
}

export async function buildBackupArchive(
  supabase: SupabaseClient,
): Promise<{ archiveBytes: Buffer; manifest: BackupManifest; rowCounts: Record<string, number> }> {
  const manifest: BackupManifest = {
    version: 1,
    format: 'json-gzip',
    created_at: new Date().toISOString(),
    site_url: process.env.NEXT_PUBLIC_SITE_URL || null,
    tables: {},
  }
  const rowCounts: Record<string, number> = {}
  const data: Record<string, Record<string, unknown>[]> = {}

  for (const { name, orderBy } of BACKUP_TABLES) {
    const { rows, error } = await fetchTableRows(supabase, name, orderBy)
    if (error) {
      manifest.tables[name] = { count: 0, skipped: true, error }
      rowCounts[name] = 0
      continue
    }
    manifest.tables[name] = { count: rows.length }
    rowCounts[name] = rows.length
    data[name] = rows
  }

  const payload = JSON.stringify({ manifest, data })
  const archiveBytes = gzipSync(payload, { level: 6 })
  return { archiveBytes, manifest, rowCounts }
}
