import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { BRAND_ACCESS_COOKIE, ACCESS_COOKIE_MAX_AGE, brandGateEnabled, verifyBrandPassword } from '@/lib/server/brand-access'

// Verifies the shared brand-site password and, on success, sets the access cookie
// that unlocks /brand. Rate-limited because it is an unauthenticated public endpoint
// that checks a secret.
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!(await brandGateEnabled())) {
    return NextResponse.json({ error: 'Password access is not configured.' }, { status: 503 })
  }

  const rl = await checkRateLimit(request, { scope: 'brand_access', max: 10, windowMs: 60 * 1000 })
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a minute.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const body = await request.json().catch(() => ({})) as { password?: string }
  const token = await verifyBrandPassword(String(body.password || ''))
  if (!token) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
  }

  const res = NextResponse.json({ success: true })
  res.cookies.set(BRAND_ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ACCESS_COOKIE_MAX_AGE,
  })
  return res
}
