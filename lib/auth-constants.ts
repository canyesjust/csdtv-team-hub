/** Minimum password length for staff portal (login reset + settings). */
export const MIN_PASSWORD_LENGTH = 8

/** Safe internal path after login (blocks open redirects). */
export function sanitizePostLoginPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/dashboard'
  const pathOnly = raw.split('?')[0].split('#')[0]
  if (pathOnly === '/login') return '/dashboard'
  if (pathOnly.startsWith('/dashboard')) return raw.split('#')[0]
  return '/dashboard'
}
