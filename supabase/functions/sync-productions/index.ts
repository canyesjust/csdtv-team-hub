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

type SyncBody = {
  productions?: unknown[]
  /** When true (default), Hub rows absent from this payload are removed. Set false for partial updates. */
  full_snapshot?: boolean
}

function parsePayload(raw: unknown): { productions: Record<string, unknown>[]; fullSnapshot: boolean } | null {
  if (Array.isArray(raw)) {
    return { productions: raw as Record<string, unknown>[], fullSnapshot: true }
  }
  if (raw && typeof raw === 'object' && Array.isArray((raw as SyncBody).productions)) {
    const body = raw as SyncBody
    return {
      productions: body.productions as Record<string, unknown>[],
      fullSnapshot: body.full_snapshot !== false,
    }
  }
  return null
}

function productionNumbers(rows: Record<string, unknown>[]): number[] {
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

/** Remove Hub productions no longer present on the district site (full snapshot sync). */
async function pruneMissingFromSnapshot(
  supabase: ReturnType<typeof createClient>,
  keepNumbers: number[],
): Promise<{ removed: number; errors: string[] }> {
  if (keepNumbers.length === 0) {
    return { removed: 0, errors: ['prune skipped: no production_number values in payload'] }
  }

  const list = `(${keepNumbers.join(',')})`
  const { data: stale, error: listErr } = await supabase
    .from('productions')
    .select('id, production_number')
    .not('production_number', 'in', list)

  if (listErr) return { removed: 0, errors: [listErr.message] }
  const rows = stale || []
  if (rows.length === 0) return { removed: 0, errors: [] }

  const ids = rows.map(r => r.id as string)
  const errors: string[] = []

  const { error: videoErr } = await supabase.from('videos').update({ production_id: null }).in('production_id', ids)
  if (videoErr) errors.push(`videos unlink: ${videoErr.message}`)

  for (const id of ids) {
    await supabase.from('dismissed_conflicts').delete().or(`production_a_id.eq.${id},production_b_id.eq.${id}`)
  }

  const { error: delErr } = await supabase.from('productions').delete().in('id', ids)
  if (delErr) {
    errors.push(`productions delete: ${delErr.message}`)
    return { removed: 0, errors }
  }

  console.log(
    `Pruned ${rows.length} production(s) not in snapshot:`,
    rows.map(r => r.production_number).join(', '),
  )
  return { removed: rows.length, errors }
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

  const parsed = parsePayload(raw)
  if (!parsed || parsed.productions.length === 0) {
    return json({ error: 'Expected a non-empty array of productions (or { productions: [...] })' }, 400)
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!)

  const { data, error } = await supabase
    .from('productions')
    .upsert(parsed.productions, { onConflict: 'production_number' })
    .select('id, production_number')

  if (error) {
    console.error('Supabase upsert error:', error.message)
    return json({ error: error.message }, 500)
  }

  let pruned = 0
  let pruneErrors: string[] = []
  if (parsed.fullSnapshot) {
    const keep = productionNumbers(parsed.productions)
    const pruneResult = await pruneMissingFromSnapshot(supabase, keep)
    pruned = pruneResult.removed
    pruneErrors = pruneResult.errors
  }

  console.log(`Synced ${data?.length ?? 0} productions; pruned ${pruned}`)
  return json({
    success: true,
    synced: data?.length ?? 0,
    pruned,
    full_snapshot: parsed.fullSnapshot,
    ...(pruneErrors.length > 0 ? { prune_warnings: pruneErrors } : {}),
  })
})
