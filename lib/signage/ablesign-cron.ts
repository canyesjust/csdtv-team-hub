import { timingSafeEqualStr } from '@/lib/server/security'

export function verifySignageCron(request: Request): boolean {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return false

  const token = auth.slice('Bearer '.length)
  if (timingSafeEqualStr(token, process.env.CRON_SECRET)) return true
  if (timingSafeEqualStr(token, process.env.SUPABASE_SERVICE_ROLE_KEY)) return true

  return false
}
