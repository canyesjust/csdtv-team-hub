import type { SupabaseClient } from '@supabase/supabase-js'

export type EffectiveTeamMember = {
  id: string
  name: string
  role: string
  email: string | null
  avatar_color: string | null
}

export type EffectiveTeamResponse = {
  team: EffectiveTeamMember
  isViewAs: boolean
  actor: { id: string; name: string; role: string }
}

/** Effective team row for the signed-in user (respects manager view-as). */
export async function fetchEffectiveTeam(): Promise<EffectiveTeamResponse | null> {
  const res = await fetch('/api/me/team', { cache: 'no-store' })
  if (!res.ok) return null
  return (await res.json()) as EffectiveTeamResponse
}

/** Load full team row by effective id (works with view-as RLS). */
export async function resolveEffectiveTeamRow<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  select = '*',
): Promise<T | null> {
  const effective = await fetchEffectiveTeam()
  if (!effective?.team) return null
  const { data, error } = await supabase.from('team').select(select).eq('id', effective.team.id).single()
  if (error || !data) return null
  return data as T
}
