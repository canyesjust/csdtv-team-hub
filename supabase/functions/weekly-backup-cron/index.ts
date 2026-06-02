// Invoked by Supabase pg_cron weekly. Proxies to Next.js /api/cron/weekly-backup.
// Deploy with verify_jwt: false. Auth: app_settings.weekly_backup_cron_token (see db/weekly_backup_cron.sql).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://www.csdtvstaff.org'
const CRON_TOKEN_KEY = 'weekly_backup_cron_token'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async req => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server configuration error' }, 500)
  }

  const cronHeader = req.headers.get('x-weekly-backup-cron-token')
  if (!cronHeader) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const { data: row, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', CRON_TOKEN_KEY)
    .maybeSingle()

  if (error || !row?.value || cronHeader !== row.value) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const backupUrl = `${SITE_URL.replace(/\/$/, '')}/api/cron/weekly-backup`
  const cronSecret = Deno.env.get('CRON_SECRET')
  const headers: Record<string, string> = cronSecret
    ? { Authorization: `Bearer ${cronSecret}` }
    : { 'x-vercel-cron': '1' }

  const res = await fetch(backupUrl, { method: 'GET', headers })
  const text = await res.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    /* keep raw */
  }

  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
})
