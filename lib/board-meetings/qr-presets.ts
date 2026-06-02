/** Built-in QR presets — key is fixed; URL resolved at push time in qr-control. */
export const BUILTIN_QR_PRESET_KEYS = new Set([
  'agenda',
  'document_current_item',
  'youtube_live',
  'archive',
  'submit_comment',
])

export type QrPresetRow = {
  id: string
  key: string
  label: string
  url_template: string | null
  description: string | null
  sort_order: number
}

export const QR_TEMPLATE_VARS = [
  { key: 'agenda_url', label: 'Public agenda URL (from board meeting)' },
  { key: 'production_number', label: 'Production number' },
  { key: 'youtube_url', label: 'YouTube / livestream URL' },
] as const

export function templateUsesAgendaUrl(template: string | null | undefined): boolean {
  return !!template?.includes('{agenda_url}')
}

export function isBuiltinQrPresetKey(key: string): boolean {
  return BUILTIN_QR_PRESET_KEYS.has(key)
}
