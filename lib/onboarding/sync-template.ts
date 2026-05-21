import type { SupabaseClient } from '@supabase/supabase-js'
import type { OnboardingTrackId } from './constants'
import { ONBOARDING_ASSIGNMENT_STATUS } from './constants'
import type { OnboardingTemplateItem } from './types'

/** Copy active template items into all non-complete assignments on this track. */
export async function syncTemplateToOpenAssignments(
  supabase: SupabaseClient,
  trackId: OnboardingTrackId,
): Promise<{ error?: string }> {
  const { data: templates, error: tplErr } = await supabase
    .from('onboarding_template_items')
    .select('*')
    .eq('track_id', trackId)
    .order('sort_order')

  if (tplErr) return { error: tplErr.message }
  const activeTemplates = (templates || []).filter((t) => t.active) as OnboardingTemplateItem[]

  const { data: assignments, error: asnErr } = await supabase
    .from('onboarding_assignments')
    .select('id, status')
    .eq('track_id', trackId)
    .neq('status', ONBOARDING_ASSIGNMENT_STATUS.complete)

  if (asnErr) return { error: asnErr.message }
  if (!assignments?.length) return {}

  for (const assignment of assignments) {
    const err = await syncAssignmentInstances(supabase, assignment.id, activeTemplates)
    if (err) return { error: err }
  }
  return {}
}

export async function syncAssignmentInstances(
  supabase: SupabaseClient,
  assignmentId: string,
  activeTemplates: OnboardingTemplateItem[],
): Promise<string | undefined> {
  const { data: existing, error: exErr } = await supabase
    .from('onboarding_item_instances')
    .select('*')
    .eq('assignment_id', assignmentId)

  if (exErr) return exErr.message

  const byTemplateId = new Map(
    (existing || [])
      .filter((r) => r.template_item_id)
      .map((r) => [r.template_item_id as string, r]),
  )
  const activeIds = new Set(activeTemplates.map((t) => t.id))
  const now = new Date().toISOString()

  for (const tpl of activeTemplates) {
    const row = byTemplateId.get(tpl.id)
    if (!row) {
      const { error } = await supabase.from('onboarding_item_instances').insert({
        assignment_id: assignmentId,
        template_item_id: tpl.id,
        phase_id: tpl.phase_id,
        category_id: tpl.category_id,
        title: tpl.title,
        description: tpl.description,
        library_article_id: tpl.library_article_id,
        sort_order: tpl.sort_order,
        required: tpl.required,
        completed: false,
        is_ad_hoc: false,
      })
      if (error) return error.message
      continue
    }
    if (row.removed_at) continue
    const { error } = await supabase
      .from('onboarding_item_instances')
      .update({
        phase_id: tpl.phase_id,
        category_id: tpl.category_id,
        title: tpl.title,
        description: tpl.description,
        library_article_id: tpl.library_article_id,
        sort_order: tpl.sort_order,
        required: tpl.required,
      })
      .eq('id', row.id)
    if (error) return error.message
  }

  for (const row of existing || []) {
    if (!row.template_item_id || row.removed_at || row.completed) continue
    if (!activeIds.has(row.template_item_id)) {
      const { error } = await supabase
        .from('onboarding_item_instances')
        .update({ removed_at: now })
        .eq('id', row.id)
      if (error) return error.message
    }
  }
  return undefined
}

/** Create assignment + instances for a team member from current template. */
export async function startOnboardingForMember(
  supabase: SupabaseClient,
  trackId: OnboardingTrackId,
  teamMemberId: string,
): Promise<{ assignmentId?: string; error?: string }> {
  const { data: templates, error: tplErr } = await supabase
    .from('onboarding_template_items')
    .select('*')
    .eq('track_id', trackId)
    .eq('active', true)
    .order('sort_order')

  if (tplErr) return { error: tplErr.message }

  const { data: assignment, error: insErr } = await supabase
    .from('onboarding_assignments')
    .insert({
      track_id: trackId,
      team_member_id: teamMemberId,
      status: ONBOARDING_ASSIGNMENT_STATUS.in_progress,
    })
    .select('id')
    .single()

  if (insErr) return { error: insErr.message }

  const err = await syncAssignmentInstances(
    supabase,
    assignment.id,
    (templates || []) as OnboardingTemplateItem[],
  )
  if (err) return { error: err }
  return { assignmentId: assignment.id }
}
