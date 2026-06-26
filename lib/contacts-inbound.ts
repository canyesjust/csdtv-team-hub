/**
 * Pure helpers for the inbound BCC capture webhook (app/api/contacts/inbound).
 *
 * Kept free of any I/O so the address parsing and recipient-derivation logic can
 * be unit-tested without a server or database. The route layer handles auth,
 * rate limiting, DB access, and summarization.
 */

export type ParsedAddress = { name: string | null; email: string }

/** RFC-ish email check. Intentionally permissive but bounded. */
export function isEmailAddress(value: string): boolean {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

/**
 * Parse a single address token, supporting `Display Name <user@host>` and bare
 * `user@host`. Returns null if no valid email is present. Email is lowercased
 * and trimmed; display name is preserved (quotes stripped) or null.
 */
export function parseOneAddress(raw: string): ParsedAddress | null {
  const s = (raw || '').trim()
  if (!s) return null

  const angle = s.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/)
  let name: string | null = null
  let email: string
  if (angle) {
    name = (angle[1] || '').trim() || null
    email = angle[2].trim()
  } else {
    email = s
  }
  email = email.trim().toLowerCase()
  if (!isEmailAddress(email)) return null
  return { name, email }
}

/**
 * Parse a header value that may be a comma-separated string or an array of
 * strings (each possibly comma-separated). Invalid tokens are dropped. The
 * result is de-duplicated by email (first display name wins).
 */
export function parseAddressList(value: unknown): ParsedAddress[] {
  const tokens: string[] = []
  if (Array.isArray(value)) {
    for (const v of value) if (typeof v === 'string') tokens.push(...v.split(','))
  } else if (typeof value === 'string') {
    tokens.push(...value.split(','))
  }

  const seen = new Set<string>()
  const out: ParsedAddress[] = []
  for (const t of tokens) {
    const parsed = parseOneAddress(t)
    if (!parsed) continue
    if (seen.has(parsed.email)) continue
    seen.add(parsed.email)
    out.push(parsed)
  }
  return out
}

/**
 * Given the To + Cc recipients and the set of addresses to exclude (the sender,
 * every team member, and the capture inbox itself), return the external contacts
 * worth capturing, de-duplicated and capped.
 */
export function deriveExternalContacts(
  to: unknown,
  cc: unknown,
  exclude: Iterable<string>,
  maxRecipients: number,
): ParsedAddress[] {
  const excludeSet = new Set<string>()
  for (const e of exclude) {
    const n = (e || '').trim().toLowerCase()
    if (n) excludeSet.add(n)
  }

  const seen = new Set<string>()
  const out: ParsedAddress[] = []
  for (const addr of [...parseAddressList(to), ...parseAddressList(cc)]) {
    if (excludeSet.has(addr.email)) continue
    if (seen.has(addr.email)) continue
    seen.add(addr.email)
    out.push(addr)
    if (out.length >= maxRecipients) break
  }
  return out
}

/** Best-effort HTML→text for when a provider only sends an HTML body. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|br|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
