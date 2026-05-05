/** Escape text for safe insertion into HTML (body, attributes, or `<title>`). */
export function escapeHtml(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return ''
  const s = String(raw)
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Strip characters that can break or inject email headers (e.g. newline in Subject).
 * Use for notification subjects built from user-editable fields.
 */
export function sanitizeEmailSubject(raw: string | number | null | undefined, maxLen = 200): string {
  if (raw === null || raw === undefined) return ''
  return String(raw)
    .replace(/[\r\n\u0000\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
}
