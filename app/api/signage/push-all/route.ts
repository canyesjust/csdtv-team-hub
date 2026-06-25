/**
 * Batch HTML push for AbleSign-linked screens. Scheduled via Supabase pg_cron
 * (see db/ablesign_html_push_cron.sql), NOT Vercel Cron — the Hobby plan blocks
 * deployments when vercel.json defines crons. Two modes:
 *
 *   ?mode=dirty  (default) — push only screens flagged dirty by a content edit.
 *                            Drive this on a short cadence (~3 min) so edits
 *                            propagate quickly.
 *   ?mode=due              — render every linked screen. The content-hash skip
 *                            means only screens whose HTML actually changed
 *                            (weather refresh, date-range rollovers) get pushed.
 *                            Drive this every ~30 min + a midnight pass.
 *
 * Cron auth uses CRON_SECRET (verifySignageCron); managers may also call it.
 */
import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { verifySignageCron } from '@/lib/signage/ablesign-cron'
import { requireManagerApi } from '@/lib/signage/server-auth'
import { writeAbleSignLog } from '@/lib/signage/ablesign-helpers'
import { renderAndPushScreen, type PushTrigger } from '@/lib/signage/push-screen'

// pg_cron calls authenticate with a token stored in app_settings (matching the
// other Supabase crons), so no Vercel env var or service-role key is embedded in
// the scheduled command. The token is read from the DB at run time.
const PUSH_TOKEN_KEY = 'signage_html_push_cron_token'

// Quiet hours: no automatic refresh between 10pm and 5am Mountain Time. Computed
// in America/Denver so it tracks daylight saving automatically (no UTC drift).
// The manual per-screen Regenerate & Push button is unaffected, and ?force=1
// bypasses this for testing.
const QUIET_START_HOUR = 22 // 10pm
const QUIET_END_HOUR = 5 // 5am

function isQuietHoursDenver(now = new Date()): boolean {
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(now)
  const hour = parseInt(hourStr, 10)
  if (Number.isNaN(hour)) return false
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR
}

async function verifyPushToken(request: NextRequest, service: SupabaseClient): Promise<boolean> {
  const token = request.headers.get('x-signage-push-token')?.trim()
  if (!token) return false
  const { data } = await service
    .from('app_settings')
    .select('value')
    .eq('key', PUSH_TOKEN_KEY)
    .maybeSingle()
  const expected = (data?.value as string | undefined)?.trim()
  return Boolean(expected) && token === expected
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

// Gentle pacing between screens to stay clear of AbleSign per-screen rate limits.
const PUSH_PACE_MS = 400

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function pushBatch(mode: 'dirty' | 'due') {
  const service = getServiceSupabaseClient()
  if (!service) return { error: 'Server configuration error', status: 500 as const }

  let query = service
    .from('signage_screens')
    .select('code')
    .eq('active', true)
    .not('ablesign_screen_id', 'is', null)

  if (mode === 'dirty') {
    query = query.not('ablesign_html_dirty_at', 'is', null)
  }

  const { data: screens, error } = await query
  if (error) return { error: error.message, status: 500 as const }

  const trigger: PushTrigger = mode === 'dirty' ? 'cron-dirty' : 'cron-due'
  let pushed = 0
  let skipped = 0
  let failed = 0
  const details: Array<{ code: string; status: string }> = []

  for (const row of screens ?? []) {
    const result = await renderAndPushScreen(service, row.code, { trigger })
    if (!result.ok) {
      failed += 1
      details.push({ code: row.code, status: `error: ${result.error}` })
    } else if (result.skipped) {
      skipped += 1
      details.push({ code: row.code, status: `skipped (${result.reason})` })
    } else {
      pushed += 1
      details.push({ code: row.code, status: `pushed webApp ${result.webappId} (${result.bytes} bytes)` })
    }
    await sleep(PUSH_PACE_MS)
  }

  await writeAbleSignLog(service, {
    screen_id: null,
    action: 'html-push-batch',
    status: failed > 0 ? 'error' : 'ok',
    detail: `mode=${mode} total=${(screens ?? []).length} pushed=${pushed} skipped=${skipped} failed=${failed}`,
  })

  return { ok: true as const, mode, total: (screens ?? []).length, pushed, skipped, failed, details }
}

async function handle(request: NextRequest) {
  let authorized = verifySignageCron(request)
  if (!authorized) {
    const service = getServiceSupabaseClient()
    if (service) authorized = await verifyPushToken(request, service)
  }
  if (!authorized) {
    const auth = await requireManagerApi()
    if ('error' in auth) return auth.error
  }

  const params = new URL(request.url).searchParams
  const force = params.get('force') === '1'

  // Skip automatic refreshes overnight (Mountain Time). Manual single-screen
  // pushes go through /api/signage/push/[code] and are never blocked.
  if (!force && isQuietHoursDenver()) {
    return NextResponse.json({ ok: true, skipped: 'quiet_hours' })
  }

  const mode = params.get('mode') === 'due' ? 'due' : 'dirty'
  const result = await pushBatch(mode)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result)
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
