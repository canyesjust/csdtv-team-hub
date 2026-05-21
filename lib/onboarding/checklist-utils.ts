import type { OnboardingCategory, OnboardingItemInstance, OnboardingPhase } from './types'

export type GroupedChecklist = {
  phase: OnboardingPhase
  categories: {
    category: OnboardingCategory
    items: OnboardingItemInstance[]
  }[]
}[]

export function groupInstancesByPhaseCategory(
  instances: OnboardingItemInstance[],
  phases: OnboardingPhase[],
  categories: OnboardingCategory[],
): GroupedChecklist {
  const visible = instances.filter((i) => !i.removed_at)
  const phaseOrder = [...phases].filter((p) => p.active).sort((a, b) => a.sort_order - b.sort_order)
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]))

  return phaseOrder.map((phase) => {
    const phaseItems = visible
      .filter((i) => i.phase_id === phase.id)
      .sort((a, b) => a.sort_order - b.sort_order)

    const catIds = [...new Set(phaseItems.map((i) => i.category_id).filter(Boolean))] as string[]
    const catOrder = catIds
      .map((id) => catById[id])
      .filter(Boolean)
      .sort((a, b) => a.sort_order - b.sort_order)

    const categoriesGrouped = catOrder.map((category) => ({
      category,
      items: phaseItems.filter((i) => i.category_id === category.id),
    }))

    const uncategorized = phaseItems.filter((i) => !i.category_id || !catById[i.category_id])
    if (uncategorized.length > 0) {
      categoriesGrouped.push({
        category: {
          id: '_other',
          track_id: phase.track_id,
          label: 'Other',
          sort_order: 999,
          active: true,
        },
        items: uncategorized,
      })
    }

    return { phase, categories: categoriesGrouped.filter((c) => c.items.length > 0) }
  }).filter((g) => g.categories.length > 0)
}

export function requiredProgress(instances: OnboardingItemInstance[]) {
  const active = instances.filter((i) => !i.removed_at)
  const required = active.filter((i) => i.required)
  const done = required.filter((i) => i.completed)
  return {
    requiredTotal: required.length,
    requiredDone: done.length,
    pct: required.length > 0 ? Math.round((done.length / required.length) * 100) : 0,
  }
}

export function canSubmitForSignoff(instances: OnboardingItemInstance[]) {
  const active = instances.filter((i) => !i.removed_at && i.required)
  return active.length > 0 && active.every((i) => i.completed)
}
