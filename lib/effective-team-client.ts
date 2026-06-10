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

// The effective-team identity is requested several times on a single page load
// (the app shell, the production drawer, useEffectiveTeam, and resolveEffectiveTeamRow
// each ask for it). Without coordination that's 3–4 duplicate round-trips per
// navigation. We dedupe concurrent callers onto one in-flight request and briefly
// cache the result so navigating between pages reuses it. View-as switches call
// clearEffectiveTeamCache() (and start/stop reload the app anyway).
let cachedTeam: EffectiveTeamResponse | null = null
let cachedAt = 0
let inFlight: Promise<EffectiveTeamResponse | null> | null = null
const EFFECTIVE_TEAM_TTL_MS = 30_000

export function clearEffectiveTeamCache(): void {
  cachedTeam = null
  cachedAt = 0
  inFlight = null
}

/** Effective team row for the signed-in user (respects manager view-as). */
export async function fetchEffectiveTeam(opts?: { force?: boolean }): Promise<EffectiveTeamResponse | null> {
  if (!opts?.force) {
    if (cachedTeam && Date.now() - cachedAt < EFFECTIVE_TEAM_TTL_MS) return cachedTeam
    if (inFlight) return inFlight
  }
  inFlight = (async () => {
    try {
      const res = await fetch('/api/me/team', { cache: 'no-store' })
      const value = res.ok ? ((await res.json()) as EffectiveTeamResponse) : null
      if (value) { cachedTeam = value; cachedAt = Date.now() }
      return value
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

/** Load team row fields by effective id (works with view-as RLS). Pass T matching your `select`. */
export async function resolveEffectiveTeamRow<T = EffectiveTeamMember>(
  supabase: SupabaseClient,
  select = '*',
): Promise<T | null> {
  const effective = await fetchEffectiveTeam()
  if (!effective?.team) return null
  const { data, error } = await supabase.from('team').select(select).eq('id', effective.team.id).single()
  if (error || !data) return null
  return data as T
}
