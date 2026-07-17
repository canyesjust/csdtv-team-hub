import { timingSafeEqualStr } from '@/lib/server/security'

/**
 * Authorize scheduled Next.js cron routes with a Bearer secret only.
 * Do not trust `x-vercel-cron` — that header is client-spoofable.
 *
 * Accepts CRON_SECRET or the service-role key (for pg_cron / edge callers that
 * already store the service key server-side).
 */
export function verifyCronBearer(request: Request): boolean {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return false

  const token = auth.slice('Bearer '.length)
  if (timingSafeEqualStr(token, process.env.CRON_SECRET)) return true
  if (timingSafeEqualStr(token, process.env.SUPABASE_SERVICE_ROLE_KEY)) return true

  return false
}
