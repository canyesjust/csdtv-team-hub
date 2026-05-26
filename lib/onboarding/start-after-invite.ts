import type { SupabaseClient } from '@supabase/supabase-js'
import { trackIdForTeamRole } from './constants'
import { ensureOnboardingSeed } from './seed-database'
import { startOnboardingForMember } from './sync-template'

/** Start intern/student-intern onboarding when a manager invites someone (skip if already assigned). */
export async function startOnboardingAfterInviteIfNeeded(
  supabase: SupabaseClient,
  teamMemberId: string,
  role: string,
): Promise<{ started: boolean; error?: string }> {
  const trackId = trackIdForTeamRole(role)
  if (!trackId) return { started: false }

  await ensureOnboardingSeed(supabase)

  const { data: existing } = await supabase
    .from('onboarding_assignments')
    .select('id')
    .eq('team_member_id', teamMemberId)
    .eq('track_id', trackId)
    .maybeSingle()

  if (existing) return { started: false }

  const { error } = await startOnboardingForMember(supabase, trackId, teamMemberId)
  if (error) return { started: false, error }
  return { started: true }
}
