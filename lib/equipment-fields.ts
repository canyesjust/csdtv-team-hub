/** Canonical equipment site/condition values (Postgres check constraints on public.equipment). */

export const EQUIPMENT_SITE_OPTIONS = [
  { value: 'District Office', label: 'District Office' },
  { value: 'Van', label: 'Van' },
  { value: 'Trailer', label: 'Trailer' },
  { value: 'Other', label: 'Other' },
] as const

export const EQUIPMENT_CONDITION_OPTIONS = [
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'needs_repair', label: 'Needs repair' },
  { value: 'damaged', label: 'Damaged' },
] as const

export type EquipmentSite = (typeof EQUIPMENT_SITE_OPTIONS)[number]['value']
export type EquipmentCondition = (typeof EQUIPMENT_CONDITION_OPTIONS)[number]['value']

export const DEFAULT_EQUIPMENT_SITE: EquipmentSite = 'District Office'
export const DEFAULT_EQUIPMENT_CONDITION: EquipmentCondition = 'good'

const SITE_VALUES = new Set<string>(EQUIPMENT_SITE_OPTIONS.map(o => o.value))
const CONDITION_VALUES = new Set<string>(EQUIPMENT_CONDITION_OPTIONS.map(o => o.value))

export function formatEquipmentSite(site: string | null | undefined): string {
  return EQUIPMENT_SITE_OPTIONS.find(o => o.value === site)?.label ?? site ?? ''
}

export function formatEquipmentCondition(condition: string | null | undefined): string {
  return EQUIPMENT_CONDITION_OPTIONS.find(o => o.value === condition)?.label ?? condition ?? ''
}

/** Normalize legacy UI labels before insert/update. */
export function normalizeEquipmentSite(site: string | null | undefined): EquipmentSite {
  if (!site) return DEFAULT_EQUIPMENT_SITE
  if (site === 'Office') return 'District Office'
  if (SITE_VALUES.has(site)) return site as EquipmentSite
  return DEFAULT_EQUIPMENT_SITE
}

export function normalizeEquipmentCondition(condition: string | null | undefined): EquipmentCondition {
  if (!condition) return DEFAULT_EQUIPMENT_CONDITION
  if (CONDITION_VALUES.has(condition)) return condition as EquipmentCondition
  const key = condition.toLowerCase().replace(/\s+/g, '_')
  if (key === 'broken') return 'damaged'
  if (CONDITION_VALUES.has(key)) return key as EquipmentCondition
  return DEFAULT_EQUIPMENT_CONDITION
}
