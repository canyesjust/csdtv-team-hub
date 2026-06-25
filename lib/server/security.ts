import { timingSafeEqual } from 'crypto'

/**
 * Best-effort client IP from the proxy headers Vercel sets. Used as a rate-limit
 * key, not for authorization, so an "unknown" fallback is acceptable.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}

/**
 * Constant-time string comparison for secrets/tokens. Returns false for any
 * missing value and never short-circuits on length, so it does not leak how much
 * of a guess was correct via timing.
 */
export function timingSafeEqualStr(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  // timingSafeEqual throws if lengths differ; hash to a fixed length first so the
  // comparison itself is always constant-time regardless of input lengths.
  if (bufA.length !== bufB.length) {
    // Compare against itself to burn a roughly constant amount of time, then fail.
    try {
      timingSafeEqual(bufA, bufA)
    } catch {}
    return false
  }
  try {
    return timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}
