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
