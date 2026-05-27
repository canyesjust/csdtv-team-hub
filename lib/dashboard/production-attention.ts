import { dayDiffFromToday } from '@/lib/dashboard/day-diff'

/** Minimal production shape for staffing / prep risk checks. */
export interface ProductionRiskInput {
  start_datetime: string | null
  production_members?: unknown[] | null
  checklist_items?: { completed: boolean }[] | null
}

export function getChecklistPrepPct(prod: ProductionRiskInput): number | null {
  const items = prod.checklist_items ?? []
  if (items.length === 0) return null
  const done = items.filter(i => i.completed).length
  return Math.round((done / items.length) * 100)
}

/** Production has zero crew assigned (understaffed). */
export function isUnderstaffed(prod: ProductionRiskInput): boolean {
  return (prod.production_members ?? []).length === 0
}

/** @deprecated Use isUnderstaffed */
export function hasNoCrew(prod: ProductionRiskInput): boolean {
  return isUnderstaffed(prod)
}

export function startsWithinDays(prod: ProductionRiskInput, maxDays: number): boolean {
  const days = dayDiffFromToday(prod.start_datetime)
  return days !== null && days >= 0 && days <= maxDays
}

/** Low prep only when a checklist exists and completion is below threshold. */
export function isLowPrepAttention(prod: ProductionRiskInput): boolean {
  const pct = getChecklistPrepPct(prod)
  if (pct === null) return false
  const days = dayDiffFromToday(prod.start_datetime)
  if (days === null || days < 0 || days > 2) return false
  if (days <= 1) return pct < 50
  return pct < 70
}

export type StatusToneKey = 'success' | 'warning' | 'danger'

/** Calendar / card status dot — no flag for single crew or missing checklist. */
export function getProductionStatusTone(prod: ProductionRiskInput): StatusToneKey {
  const days = dayDiffFromToday(prod.start_datetime)
  if (days !== null && days <= 1) {
    if (isUnderstaffed(prod)) return 'danger'
    const pct = getChecklistPrepPct(prod)
    if (pct !== null && pct < 50) return 'danger'
  }
  if (days !== null && days <= 2) {
    const pct = getChecklistPrepPct(prod)
    if (pct !== null && pct < 70) return 'warning'
  }
  return 'success'
}
