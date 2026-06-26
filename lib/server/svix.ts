import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Verify a Svix-style signed webhook (used by Resend's inbound webhooks).
 *
 * Algorithm (https://docs.svix.com/receiving/verifying-payloads/how-manual):
 *   signedContent = `${id}.${timestamp}.${rawBody}`
 *   expected      = base64( HMAC_SHA256( secretBytes, signedContent ) )
 * The `svix-signature` header is a space-separated list of `v1,<sig>` tokens;
 * the request is valid if any token matches the expected signature. We also
 * enforce a timestamp tolerance to blunt replay attacks.
 *
 * IMPORTANT: pass the RAW request body string (the exact bytes received).
 * Re-stringifying parsed JSON will change the bytes and break verification.
 */
export function verifySvixSignature(opts: {
  secret: string
  id: string | null
  timestamp: string | null
  signatureHeader: string | null
  body: string
  /** Allowed clock skew in seconds (default 300). */
  toleranceSec?: number
  /** Override "now" (seconds since epoch) — for tests. */
  nowSec?: number
}): boolean {
  const { secret, id, timestamp, signatureHeader, body } = opts
  if (!secret || !id || !timestamp || !signatureHeader) return false

  const ts = Number.parseInt(timestamp, 10)
  if (!Number.isFinite(ts)) return false
  const tolerance = opts.toleranceSec ?? 300
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - ts) > tolerance) return false

  // Svix secrets are `whsec_<base64>`; the bytes after the prefix are the key.
  const rawSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret
  let key: Buffer
  try {
    key = Buffer.from(rawSecret, 'base64')
  } catch {
    return false
  }
  if (key.length === 0) return false

  const signedContent = `${id}.${timestamp}.${body}`
  const expected = createHmac('sha256', key).update(signedContent).digest('base64')
  const expectedBuf = Buffer.from(expected)

  // Header may carry multiple versioned signatures, e.g. "v1,aaa v1,bbb".
  return signatureHeader.split(' ').some((token) => {
    const comma = token.indexOf(',')
    if (comma < 0) return false
    const version = token.slice(0, comma)
    const sig = token.slice(comma + 1)
    if (version !== 'v1' || !sig) return false
    const sigBuf = Buffer.from(sig)
    if (sigBuf.length !== expectedBuf.length) return false
    try {
      return timingSafeEqual(sigBuf, expectedBuf)
    } catch {
      return false
    }
  })
}
