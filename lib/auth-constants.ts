/** Minimum password length for staff portal (login reset + settings). */
export const MIN_PASSWORD_LENGTH = 8

/** Where a signage-only editor lands. Their first stop is their content queue. */
export const SIGNAGE_HOME_PATH = '/dashboard/signage/content'

/** The Canyons-branded sign-in page. Signage people should never see /login. */
export const SIGNAGE_LOGIN_PATH = '/signage-login'

/**
 * Safe internal path after login (blocks open redirects). `fallback` lets the
 * signage-skinned login send people to the signage tool instead of the Hub
 * home; it is itself sanitized, so a bad fallback can't open a redirect either.
 */
export function sanitizePostLoginPath(
  raw: string | null | undefined,
  fallback: string = '/dashboard',
): string {
  const safeFallback = fallback.startsWith('/dashboard') ? fallback : '/dashboard'
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return safeFallback
  const pathOnly = raw.split('?')[0].split('#')[0]
  if (pathOnly === '/login' || pathOnly === '/signage-login') return safeFallback
  if (pathOnly.startsWith('/dashboard')) return raw.split('#')[0]
  return safeFallback
}
