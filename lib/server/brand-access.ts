import { cache } from 'react'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { timingSafeEqualStr } from '@/lib/server/security'

// Shared-password gate for the public brand library.
//
// Source of truth (in priority order):
//   1. brand_access_config DB row (set/changed by a manager from Settings).
//   2. BRAND_SITE_PASSWORD env var (bootstrap / fallback).
//   3. Neither set -> gate disabled, /brand is open.
//
// Signed-in staff bypass the gate, as does a valid review link (via a review cookie
// set by middleware). The access cookie holds an opaque session token equal to the
// current config token; changing the password rotates the token and logs everyone out.

export const BRAND_ACCESS_COOKIE = 'csd_brand_access'
export const BRAND_REVIEW_COOKIE = 'csd_brand_review'
export const ACCESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/** Hash a password for storage: 'scrypt$<salthex>$<hashhex>'. */
export function hashBrandPassword(password: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, 32)
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`
}

function verifyHashedPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  try {
    const salt = Buffer.from(parts[1], 'hex')
    const expected = Buffer.from(parts[2], 'hex')
    const derived = scryptSync(password, salt, expected.length)
    return expected.length === derived.length && timingSafeEqual(expected, derived)
  } catch {
    return false
  }
}

/** The review cookie value the server expects when a valid review link was used. */
export function brandReviewCookieValue(): string | null {
  const key = process.env.BRAND_REVIEW_KEY
  return key ? sha256Hex(`brand-review:${key}`) : null
}

type ConfigRow = { password_hash: string | null; session_token: string | null; updated_at: string | null }

// Read the single config row once per request.
const readConfigRow = cache(async (): Promise<ConfigRow | null> => {
  const service = getServiceSupabaseClient()
  if (!service) return null
  const { data } = await service
    .from('brand_access_config')
    .select('password_hash, session_token, updated_at')
    .eq('id', 1)
    .maybeSingle()
  return (data as ConfigRow | null) ?? null
})

type EffectiveConfig =
  | { enabled: false }
  | { enabled: true; source: 'database' | 'environment'; sessionToken: string; verify: (input: string) => boolean; updatedAt: string | null }

async function getEffectiveConfig(): Promise<EffectiveConfig> {
  const row = await readConfigRow()
  if (row?.password_hash && row.session_token) {
    return {
      enabled: true,
      source: 'database',
      sessionToken: row.session_token,
      verify: (input: string) => verifyHashedPassword(input, row.password_hash as string),
      updatedAt: row.updated_at,
    }
  }
  const envPassword = process.env.BRAND_SITE_PASSWORD
  if (envPassword) {
    return {
      enabled: true,
      source: 'environment',
      sessionToken: sha256Hex(`brand-env:${envPassword}`),
      verify: (input: string) => timingSafeEqualStr(input, envPassword),
      updatedAt: null,
    }
  }
  return { enabled: false }
}

/** True when the brand library is currently password-protected. */
export async function brandGateEnabled(): Promise<boolean> {
  return (await getEffectiveConfig()).enabled
}

/** Verify a submitted password and, if correct, return the cookie value to set. */
export async function verifyBrandPassword(input: string): Promise<string | null> {
  const cfg = await getEffectiveConfig()
  if (!cfg.enabled) return null
  return cfg.verify(input) ? cfg.sessionToken : null
}

/**
 * Access check used by the /brand server layout and the brand data APIs. Allows
 * through when the gate is disabled, when a valid access cookie or review cookie is
 * present, or when a signed-in staff member is making the request.
 */
export async function hasBrandSiteAccess(): Promise<boolean> {
  const cfg = await getEffectiveConfig()
  if (!cfg.enabled) return true

  const jar = await cookies()

  const access = jar.get(BRAND_ACCESS_COOKIE)?.value
  if (access && timingSafeEqualStr(access, cfg.sessionToken)) return true

  const reviewExpected = brandReviewCookieValue()
  const review = jar.get(BRAND_REVIEW_COOKIE)?.value
  if (reviewExpected && review && timingSafeEqualStr(review, reviewExpected)) return true

  try {
    if (await getAuthenticatedTeamUser()) return true
  } catch {
    /* ignore auth lookup failures; fall through to denied */
  }
  return false
}

/** Manager action: set or change the password. Rotates the session token. */
export async function setBrandPassword(password: string, updatedBy: string | null): Promise<{ error?: string }> {
  const service = getServiceSupabaseClient()
  if (!service) return { error: 'Server configuration error' }
  const { error } = await service
    .from('brand_access_config')
    .upsert({
      id: 1,
      password_hash: hashBrandPassword(password),
      session_token: randomBytes(32).toString('hex'),
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    })
  return error ? { error: error.message } : {}
}

/** Manager action: remove the DB password (falls back to env var or open). */
export async function clearBrandPassword(): Promise<{ error?: string }> {
  const service = getServiceSupabaseClient()
  if (!service) return { error: 'Server configuration error' }
  const { error } = await service.from('brand_access_config').delete().eq('id', 1)
  return error ? { error: error.message } : {}
}

/** Status for the Settings panel. */
export async function getBrandAccessStatus(): Promise<{ configured: boolean; source: 'database' | 'environment' | 'none'; updatedAt: string | null }> {
  const cfg = await getEffectiveConfig()
  if (!cfg.enabled) return { configured: false, source: 'none', updatedAt: null }
  return { configured: true, source: cfg.source, updatedAt: cfg.updatedAt }
}
