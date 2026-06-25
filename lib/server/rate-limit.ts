import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { clientIp } from '@/lib/server/security'

/**
 * Serverless-safe rate limiting.
 *
 * Why this exists: an in-memory `Map` counter does NOT work on Vercel. Each
 * request can hit a different lambda instance, and instances cold-start often,
 * so a per-process counter is effectively reset constantly and an attacker
 * spreading requests slips right past it.
 *
 * This limiter writes one row per request into the shared `api_rate_limits`
 * table (durable across instances) and counts rows in the current window. A
 * small in-memory cache is kept only as a fast-path to short-circuit obvious
 * floods within a single warm instance and to degrade gracefully if the DB is
 * briefly unreachable. Old rows are pruned by a pg_cron job
 * (see db/api_rate_limits_cleanup.sql).
 */

export type RateLimitOptions = {
  /** Logical bucket, e.g. 'signage_submit'. Keep stable; it is stored per row. */
  scope: string
  /** Max requests allowed per window for a given key. */
  max: number
  /** Window length in milliseconds. */
  windowMs: number
  /**
   * Extra key material appended to the IP, e.g. a production id, so limits are
   * scoped per-resource rather than globally per-IP.
   */
  keySuffix?: string
}

export type RateLimitResult = {
  limited: boolean
  retryAfterSec: number
}

const memory = new Map<string, number[]>()

function memoryCheck(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const recent = (memory.get(key) || []).filter((ts) => now - ts < windowMs)
  recent.push(now)
  memory.set(key, recent)
  // Opportunistically bound memory growth across many distinct keys.
  if (memory.size > 5000) {
    for (const [k, v] of memory) {
      if (v.every((ts) => now - ts >= windowMs)) memory.delete(k)
    }
  }
  return recent.length > max
}

async function durableCheck(
  service: SupabaseClient,
  scope: string,
  rateKey: string,
  max: number,
  windowMs: number,
): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowMs).toISOString()

  const { error: insertError } = await service
    .from('api_rate_limits')
    .insert({ scope, rate_key: rateKey })
  // If the store is unreachable we fall back to the in-memory check rather than
  // failing the user's request outright.
  if (insertError) return false

  const { count, error: countError } = await service
    .from('api_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('scope', scope)
    .eq('rate_key', rateKey)
    .gte('created_at', windowStart)
  if (countError) return false

  return (count || 0) > max
}

/**
 * Returns whether this request should be blocked. Combines a durable
 * database-backed check with an in-memory fast path; either tripping blocks.
 */
export async function checkRateLimit(
  request: Request,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const ip = clientIp(request)
  const rateKey = options.keySuffix ? `${options.keySuffix}:${ip}` : ip
  const memKey = `${options.scope}:${rateKey}`

  const memLimited = memoryCheck(memKey, options.max, options.windowMs)

  let durableLimited = false
  const service = getServiceSupabaseClient()
  if (service) {
    durableLimited = await durableCheck(
      service,
      options.scope,
      rateKey,
      options.max,
      options.windowMs,
    )
  }

  return {
    limited: memLimited || durableLimited,
    retryAfterSec: Math.ceil(options.windowMs / 1000),
  }
}
