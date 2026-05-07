import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  composeDigestForMember,
  isWeekdayInTimeZone,
  localHourInTimeZone,
  localWeekdayInTimeZone,
  todayKeyInTz,
} from '@/lib/daily-staff-digest'
import { loadDailyDigestContext } from '@/lib/load-daily-digest-context'

export const dynamic = 'force-dynamic'

function verifyCron(request: Request): boolean {
  // Vercel Cron requests include this header; accept it for platform-scheduled runs.
  const vercelCron = request.headers.get('x-vercel-cron')
  if (vercelCron === '1') return true

  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = request.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

function parseSendHour(): number {
  const raw = parseInt(process.env.DAILY_DIGEST_LOCAL_HOUR ?? '8', 10)
  if (Number.isNaN(raw) || raw < 0 || raw > 23) return 8
  return raw
}

function shouldEnforceLocalHour(): boolean {
  return process.env.DAILY_DIGEST_ENFORCE_LOCAL_HOUR === '1'
}

/**
 * Scheduled daily email to active staff (personalized).
 * Protect with CRON_SECRET: Authorization: Bearer <CRON_SECRET>
 * Also accepts Vercel's x-vercel-cron header for platform cron invocations.
 *
 * Sends once per **weekday** (Mon–Fri). The actual run time is controlled by `vercel.json`.
 * By default we do not enforce a local-hour check because some Vercel plans only allow daily cron.
 * Optional: set DAILY_DIGEST_ENFORCE_LOCAL_HOUR=1 to require local hour >= DAILY_DIGEST_LOCAL_HOUR.
 *
 * Env:
 * - CRON_SECRET (optional if only using Vercel cron header verification)
 * - DAILY_DIGEST_TIMEZONE (default America/Denver) — send time + "today" in the email
 * - DAILY_DIGEST_LOCAL_HOUR (default 8) — 0–23 local wall-clock hour (only used when DAILY_DIGEST_ENFORCE_LOCAL_HOUR=1)
 * - DAILY_DIGEST_ENFORCE_LOCAL_HOUR=1 — enable local-hour gating
 * - DAILY_DIGEST_DISABLED=1 — skip sending (health checks)
 *
 * Preview (no send): GET /api/daily-digest/preview while signed in.
 */
export async function GET(request: Request) {
  if (process.env.DAILY_DIGEST_DISABLED === '1') {
    return NextResponse.json({ ok: false, skipped: true, reason: 'DAILY_DIGEST_DISABLED' })
  }

  if (!verifyCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const tz = process.env.DAILY_DIGEST_TIMEZONE || 'America/Denver'
  const sendHour = parseSendHour()
  const now = new Date()
  if (!isWeekdayInTimeZone(now, tz)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'weekend',
      timezone: tz,
      weekday: localWeekdayInTimeZone(now, tz),
    })
  }
  const localHour = localHourInTimeZone(now, tz)
  if (shouldEnforceLocalHour() && localHour < sendHour) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'before_send_hour',
      timezone: tz,
      localHour,
      sendHour,
    })
  }

  const supabase = createClient(url, key)
  const todayKey = todayKeyInTz(now, tz)

  const { data: sentRow } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'daily_digest_last_sent')
    .maybeSingle()

  if (sentRow?.value === todayKey) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'already_sent_today',
      todayKey,
      timezone: tz,
    })
  }

  const loaded = await loadDailyDigestContext(supabase)
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: 500 })
  }

  const { ctx, team } = loaded
  if (team.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: 'No active team with email' })
  }

  const siteBase =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)
  const actionUrl =
    siteBase && siteBase.trim()
      ? `${siteBase.replace(/\/$/, '')}/dashboard`
      : '/dashboard'

  const errors: string[] = []
  let sent = 0

  for (const member of team) {
    const { subject, body, html } = composeDigestForMember(member, ctx)
    try {
      const res = await fetch(`${url}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          type: 'daily_staff_digest',
          recipientEmail: member.email,
          recipientName: member.name.trim().split(/\s+/)[0] || 'there',
          subject,
          body,
          html,
          actionUrl,
          actionLabel: 'Open Team Hub',
        }),
      })
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        errors.push(`${member.email}: ${res.status} ${t.slice(0, 200)}`)
      } else {
        sent += 1
      }
    } catch (e) {
      errors.push(`${member.email}: ${e instanceof Error ? e.message : 'send failed'}`)
    }
  }

  // Only mark the digest as sent if at least one message actually succeeded.
  if (sent > 0) {
    await supabase.from('app_settings').upsert({
      key: 'daily_digest_last_sent',
      value: todayKey,
      updated_at: new Date().toISOString(),
    })
  }

  return NextResponse.json({
    ok: errors.length === 0,
    sent,
    failed: errors.length,
    recipients: team.length,
    timezone: ctx.tz,
    todayKey: ctx.todayKey,
    sendHourLocal: sendHour,
    errors: errors.length ? errors : undefined,
  })
}
