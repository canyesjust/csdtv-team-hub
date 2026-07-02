import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { reportError } from '@/lib/server/error-report'

// Public endpoint the client error boundaries call to report a crash. Unauthenticated
// (errors happen on public pages too), so it is rate-limited and input-bounded.
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const rl = await checkRateLimit(request, { scope: 'report_error', max: 20, windowMs: 60 * 1000 })
  if (rl.limited) {
    // Silently accept so a rate-limited client does not retry-loop.
    return NextResponse.json({ ok: true })
  }

  const body = await request.json().catch(() => ({})) as { message?: string; stack?: string; url?: string; digest?: string }
  const message = String(body.message || '').trim()
  if (!message) return NextResponse.json({ ok: true })

  await reportError({
    kind: 'client',
    message,
    stack: typeof body.stack === 'string' ? body.stack : null,
    url: typeof body.url === 'string' ? body.url : null,
    digest: typeof body.digest === 'string' ? body.digest : null,
    userAgent: request.headers.get('user-agent'),
  })

  return NextResponse.json({ ok: true })
}
