/**
 * Default “if outsourced” USD estimates per district request type.
 * Used by Reports when `productions.estimated_external_cost` is null.
 */
export const EXTERNAL_COST_DEFAULTS: Record<string, number> = {
  'LiveStream Meeting': 500,
  'Record Meeting': 400,
  'Create a Video(Film, Edit, Publish)': 2500,
  'Board Meeting': 750,
  'Photo Headshots': 300,
  'Podcast': 600,
  'Other, Unsure, Or Consultation': 400,
}

const FALLBACK_USD = 400

export function getDefaultExternalCostForType(
  requestTypeLabel: string | null | undefined
): number {
  if (!requestTypeLabel) return FALLBACK_USD
  return EXTERNAL_COST_DEFAULTS[requestTypeLabel] ?? FALLBACK_USD
}
