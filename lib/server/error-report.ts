import { createHash } from 'crypto'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

// Central error sink: logs to public.error_log and (throttled) emails an admin via
// Resend. Designed to NEVER throw, so reporting an error can't itself break a request.

export type ErrorReport = {
  kind?: 'client' | 'server' | 'api'
  message: string
  stack?: string | null
  url?: string | null
  digest?: string | null
  userAgent?: string | null
}

const FROM = 'CSDtv Alerts <noreply@csdtvstaff.org>'
const DEDUPE_MINUTES = 30 // don't re-email the same error within this window
const HOURLY_EMAIL_CAP = 10 // never send more than this many alert emails per hour

function hashMessage(message: string): string {
  return createHash('sha256').update(message).digest('hex').slice(0, 16)
}

async function resolveAdminEmail(service: ReturnType<typeof getServiceSupabaseClient>): Promise<string | null> {
  const envEmail = process.env.ERROR_ALERT_EMAIL?.trim()
  if (envEmail) return envEmail
  if (!service) return null
  const { data } = await service.from('app_settings').select('value').eq('key', 'admin_assistant_email').maybeSingle()
  const v = (data as { value?: string } | null)?.value?.trim()
  return v || null
}

async function sendAlertEmail(to: string, report: ErrorReport): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key) return false
  const subject = `[CSDtv] Site error: ${report.message.slice(0, 90)}`
  const rows = [
    ['When', new Date().toISOString()],
    ['Type', report.kind || 'client'],
    ['Message', report.message],
    ['URL', report.url || '-'],
    ['Digest', report.digest || '-'],
  ]
    .map(([k, v]) => `<tr><td style="padding:4px 10px;color:#6b7280;vertical-align:top">${k}</td><td style="padding:4px 10px"><code>${escapeHtml(String(v))}</code></td></tr>`)
    .join('')
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#1a1f36">
    <p>An error was reported on the Canyons Team Hub site.</p>
    <table style="border-collapse:collapse">${rows}</table>
    ${report.stack ? `<pre style="margin-top:12px;padding:10px;background:#f3f4f6;border-radius:6px;overflow:auto;font-size:12px">${escapeHtml(report.stack.slice(0, 3000))}</pre>` : ''}
  </div>`
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    })
    return res.ok
  } catch {
    return false
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

export async function reportError(report: ErrorReport): Promise<void> {
  try {
    const service = getServiceSupabaseClient()
    if (!service) return

    const message = (report.message || 'Unknown error').slice(0, 2000)
    const messageHash = hashMessage(message)
    const nowMs = Date.now()

    // Decide whether to email: skip if we alerted on this same error recently, and
    // enforce an hourly cap so a burst can't flood the inbox.
    const dedupeSince = new Date(nowMs - DEDUPE_MINUTES * 60 * 1000).toISOString()
    const hourAgo = new Date(nowMs - 60 * 60 * 1000).toISOString()
    const [{ count: sameRecent }, { count: emailedLastHour }] = await Promise.all([
      service.from('error_log').select('id', { count: 'exact', head: true }).eq('emailed', true).eq('message_hash', messageHash).gte('created_at', dedupeSince),
      service.from('error_log').select('id', { count: 'exact', head: true }).eq('emailed', true).gte('created_at', hourAgo),
    ])
    const shouldEmail = (sameRecent || 0) === 0 && (emailedLastHour || 0) < HOURLY_EMAIL_CAP

    let emailed = false
    if (shouldEmail) {
      const to = await resolveAdminEmail(service)
      if (to) emailed = await sendAlertEmail(to, { ...report, message })
    }

    await service.from('error_log').insert({
      kind: report.kind || 'client',
      message,
      message_hash: messageHash,
      stack: report.stack ? report.stack.slice(0, 8000) : null,
      url: report.url ? report.url.slice(0, 1000) : null,
      digest: report.digest ? report.digest.slice(0, 200) : null,
      user_agent: report.userAgent ? report.userAgent.slice(0, 500) : null,
      emailed,
    })
  } catch {
    // Never let error reporting throw.
  }
}
