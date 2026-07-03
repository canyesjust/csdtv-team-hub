import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { OBS_ACCESS_COOKIE, ACCESS_COOKIE_MAX_AGE, obsGateEnabled, verifyObsPassword } from '@/lib/server/obs-access'

// Verifies the shared OBS-page password and, on success, sets the access cookie that
// unlocks /obs. Rate-limited because it is an unauthenticated public endpoint that
// checks a secret.
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!(await obsGateEnabled())) {
    return NextResponse.json({ error: 'Password access is not configured.' }, { status: 503 })
  }

  const rl = await checkRateLimit(request, { scope: 'obs_access', max: 10, windowMs: 60 * 1000 })
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a minute.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const body = await request.json().catch(() => ({})) as { password?: string }
  const token = await verifyObsPassword(String(body.password || ''))
  if (!token) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
  }

  const res = NextResponse.json({ success: true })
  res.cookies.set(OBS_ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ACCESS_COOKIE_MAX_AGE,
  })
  return res
}
