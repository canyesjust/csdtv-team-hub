import type { SupabaseClient } from '@supabase/supabase-js'
import { REDACTED_SETTING_KEYS } from '@/lib/weekly-backup/tables'

const PAGE_SIZE = 1000

function redactSettingsRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(row => {
    const key = String(row.key ?? '')
    if (!REDACTED_SETTING_KEYS.has(key)) return row
    return { ...row, value: '[REDACTED]' }
  })
}

function redactTeamRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(row => {
    const { supabase_user_id: _uid, ...rest } = row
    return rest
  })
}

export async function fetchTableRows(
  supabase: SupabaseClient,
  table: string,
  orderBy: string,
): Promise<{ rows: Record<string, unknown>[]; error?: string }> {
  const rows: Record<string, unknown>[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      return { rows: [], error: error.message }
    }

    const page = (data || []) as Record<string, unknown>[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  if (table === 'app_settings') return { rows: redactSettingsRows(rows) }
  if (table === 'team') return { rows: redactTeamRows(rows) }
  return { rows }
}
