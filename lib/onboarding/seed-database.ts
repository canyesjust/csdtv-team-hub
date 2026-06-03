import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ONBOARDING_TRACK_INTERN,
  ONBOARDING_TRACK_STUDENT_INTERN,
  type OnboardingTrackId,
} from './constants'
import {
  INTERN_SEED_CATEGORIES,
  INTERN_SEED_ITEMS,
  INTERN_SEED_PHASES,
  STUDENT_SEED_CATEGORIES,
  STUDENT_SEED_ITEMS,
  STUDENT_SEED_PHASES,
  type SeedItem,
} from './legacy-seed'
import { syncTemplateToOpenAssignments } from './sync-template'

async function insertTemplateStructure(
  supabase: SupabaseClient,
  trackId: OnboardingTrackId,
  phases: string[],
  categories: string[],
  items: SeedItem[],
) {
  const phaseIds: Record<string, string> = {}
  for (let i = 0; i < phases.length; i++) {
    const { data, error } = await supabase
      .from('onboarding_phases')
      .insert({ track_id: trackId, label: phases[i], sort_order: i, active: true })
      .select('id, label')
      .single()
    if (error) throw new Error(error.message)
    phaseIds[data.label] = data.id
  }

  const categoryIds: Record<string, string> = {}
  for (let i = 0; i < categories.length; i++) {
    const { data, error } = await supabase
      .from('onboarding_categories')
      .insert({ track_id: trackId, label: categories[i], sort_order: i, active: true })
      .select('id, label')
      .single()
    if (error) throw new Error(error.message)
    categoryIds[data.label] = data.id
  }

  const rows = items.map((item, i) => ({
    track_id: trackId,
    phase_id: phaseIds[item.phase],
    category_id: categoryIds[item.category],
    title: item.title,
    description: item.description,
    library_article_id: null,
    sort_order: i,
    required: item.required !== false,
    active: true,
  }))

  const { error } = await supabase.from('onboarding_template_items').insert(rows)
  if (error) throw new Error(error.message)
}

/** Retire current template rows and insert a fresh checklist for a track. */
export async function replaceTrackTemplate(
  supabase: SupabaseClient,
  trackId: OnboardingTrackId,
  phases: string[],
  categories: string[],
  items: SeedItem[],
): Promise<{ error?: string }> {
  try {
    await supabase.from('onboarding_template_items').update({ active: false }).eq('track_id', trackId)
    await supabase.from('onboarding_phases').update({ active: false }).eq('track_id', trackId)
    await supabase.from('onboarding_categories').update({ active: false }).eq('track_id', trackId)
    await insertTemplateStructure(supabase, trackId, phases, categories, items)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Replace failed' }
  }
}

async function seedTrack(
  supabase: SupabaseClient,
  trackId: OnboardingTrackId,
  trackName: string,
  teamRole: string,
  phases: string[],
  categories: string[],
  items: SeedItem[],
) {
  await supabase.from('onboarding_tracks').upsert({
    id: trackId,
    name: trackName,
    team_role: teamRole,
    active: true,
  })

  const { data: existingPhases } = await supabase
    .from('onboarding_phases')
    .select('id')
    .eq('track_id', trackId)
    .eq('active', true)
    .limit(1)

  if (existingPhases?.length) return

  await insertTemplateStructure(supabase, trackId, phases, categories, items)
}

/** Replace student intern checklist with the 2026 default and sync open assignments. */
export async function replaceStudentInternOnboardingTemplate(
  supabase: SupabaseClient,
): Promise<{ error?: string }> {
  await supabase.from('onboarding_tracks').upsert({
    id: ONBOARDING_TRACK_STUDENT_INTERN,
    name: 'Student intern',
    team_role: 'Student Intern',
    active: true,
  })

  const replaced = await replaceTrackTemplate(
    supabase,
    ONBOARDING_TRACK_STUDENT_INTERN,
    [...STUDENT_SEED_PHASES],
    [...STUDENT_SEED_CATEGORIES],
    STUDENT_SEED_ITEMS,
  )
  if (replaced.error) return replaced

  return syncTemplateToOpenAssignments(supabase, ONBOARDING_TRACK_STUDENT_INTERN)
}

/** Idempotent: seeds default tracks/phases/categories/items if phases table is empty per track. */
export async function ensureOnboardingSeed(supabase: SupabaseClient): Promise<{ error?: string }> {
  try {
    await seedTrack(
      supabase,
      ONBOARDING_TRACK_INTERN,
      'Staff intern',
      'Intern',
      INTERN_SEED_PHASES,
      INTERN_SEED_CATEGORIES,
      INTERN_SEED_ITEMS,
    )
    await seedTrack(
      supabase,
      ONBOARDING_TRACK_STUDENT_INTERN,
      'Student intern',
      'Student Intern',
      STUDENT_SEED_PHASES,
      STUDENT_SEED_CATEGORIES,
      STUDENT_SEED_ITEMS,
    )
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Seed failed' }
  }
}
