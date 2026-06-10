export function verifySignageCron(request: Request): boolean {
  if (request.headers.get('x-vercel-cron') === '1') return true

  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return false

  const token = auth.slice('Bearer '.length)
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && token === cronSecret) return true

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceKey && token === serviceKey) return true

  return false
}
