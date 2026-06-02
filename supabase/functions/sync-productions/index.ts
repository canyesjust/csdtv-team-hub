/**
 * District site → Team Hub production sync.
 *
 * SAFETY: UPSERT ONLY — never delete, archive, or prune productions here.
 * The browser extension sends paginated batches. After syncing, managers finalize
 * in Team Hub to review productions missing from the district site.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SYNC_TOKEN = Deno.env.get('SYNC_TOKEN')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const DISTRICT_SYNC_STARTED_KEY = 'district_sync_active_started_at'
const SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-sync-token',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function productionNumbersFromRows(rows: Record<string, unknown>[]): number[] {
  const out: number[] = []
  for (const row of rows) {
    const n = row.production_number
    if (typeof n === 'number' && Number.isFinite(n)) out.push(n)
    else if (typeof n === 'string' && n.trim() !== '' && Number.isFinite(Number(n))) {
      out.push(Number(n))
    }
  }
  return [...new Set(out)]
}

async function readSetting(
  supabase: ReturnType<typeof createClient>,
  key: string,
): Promise<string | null> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle()
  const v = data?.value
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

async function ensureSyncSession(supabase: ReturnType<typeof createClient>): Promise<string> {
  const existing = await readSetting(supabase, DISTRICT_SYNC_STARTED_KEY)
  if (existing) {
    const age = Date.now() - Date.parse(existing)
    if (age >= 0 && age < SESSION_MAX_AGE_MS) return existing
  }
  const now = new Date().toISOString()
  await supabase.from('app_settings').upsert({
    key: DISTRICT_SYNC_STARTED_KEY,
    value: now,
    updated_at: now,
  })
  return now
}

async function touchSeen(
  supabase: ReturnType<typeof createClient>,
  numbers: number[],
) {
  if (numbers.length === 0) return
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('productions')
    .update({ last_seen_in_district_sync_at: now, district_missing_since: null })
    .in('production_number', numbers)
  if (error) console.error('touchSeen error:', error.message)
}

function parseProductionsPayload(raw: unknown): Record<string, unknown>[] | { error: string } {
  if (!Array.isArray(raw)) {
    return {
      error:
        'Expected a JSON array of productions. This endpoint only upserts; it never deletes Hub rows.',
    }
  }
  if (raw.length === 0) {
    return { error: 'Expected a non-empty array of productions' }
  }
  return raw as Record<string, unknown>[]
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const token = req.headers.get('x-sync-token')
  if (!token || token !== SYNC_TOKEN) {
    return json({ error: 'Unauthorized' }, 401)
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const parsed = parseProductionsPayload(raw)
  if ('error' in parsed) {
    return json({ error: parsed.error }, 400)
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!)

  const syncStartedAt = await ensureSyncSession(supabase)

  const { data, error } = await supabase
    .from('productions')
    .upsert(parsed, { onConflict: 'production_number' })
    .select('id, production_number')

  if (error) {
    console.error('Supabase upsert error:', error.message)
    return json({ error: error.message }, 500)
  }

  const numbers = productionNumbersFromRows(parsed)
  await touchSeen(supabase, numbers)

  const synced = data?.length ?? 0
  console.log(`Synced ${synced} production(s) (upsert only); session ${syncStartedAt}`)
  return json({
    success: true,
    synced,
    mode: 'upsert_only',
    sync_session_started_at: syncStartedAt,
  })
})
