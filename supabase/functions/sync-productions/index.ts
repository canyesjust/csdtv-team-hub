/**
 * District site → Team Hub production sync.
 *
 * SAFETY: UPSERT ONLY — never delete, archive, or prune productions here.
 * The browser extension sends paginated batches, not a full snapshot in one request.
 * Any "remove rows missing from payload" logic will mass-delete the database.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SYNC_TOKEN = Deno.env.get('SYNC_TOKEN')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

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

  const { data, error } = await supabase
    .from('productions')
    .upsert(parsed, { onConflict: 'production_number' })
    .select('id, production_number')

  if (error) {
    console.error('Supabase upsert error:', error.message)
    return json({ error: error.message }, 500)
  }

  const synced = data?.length ?? 0
  console.log(`Synced ${synced} production(s) (upsert only)`)
  return json({ success: true, synced, mode: 'upsert_only' })
})
