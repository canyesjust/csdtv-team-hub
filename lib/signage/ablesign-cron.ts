import { verifyCronBearer } from '@/lib/server/cron-auth'

/** AbleSign / signage cron callers — Bearer CRON_SECRET or service role only. */
export function verifySignageCron(request: Request): boolean {
  return verifyCronBearer(request)
}
