import { isManagerRole, type TeamUser } from '@/lib/server/auth'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Resolved signage reach for one person. Mirrors the SQL helpers in
 * supabase/migrations/20260819190000_signage_screen_access.sql — keep the two
 * in step. Service-role API routes bypass RLS, so this is the real gate for
 * writes and the SQL is defence in depth for the browser client.
 *
 * Grants stack (union, widest wins per site):
 *   Manager                  -> everything
 *   no grants at all         -> everything (legacy fallback; predates the model)
 *   signage-only, no grants  -> NOTHING. Someone invited as signage-only is new
 *                               to the model by definition, so there's no legacy
 *                               to protect and "unassigned" must not read as
 *                               "the whole district".
 *   signage_site_access      -> that whole site
 *   signage_screen_access    -> that one screen, plus read of the site shell
 *                               it lives in (branding, wayfinding, its area)
 */
export type SignageScope = {
  /** Manager, or a user with no grants at all. */
  all: boolean
  /** Sites the user runs end to end. */
  siteIds: Set<string>
  /** Individual screens the user was granted. */
  screenIds: Set<string>
  /** Sites reachable only because a granted screen lives there (read-only shell). */
  screenSiteIds: Set<string>
}

export const FULL_SIGNAGE_SCOPE: SignageScope = {
  all: true,
  siteIds: new Set(),
  screenIds: new Set(),
  screenSiteIds: new Set(),
}

/** Signed in, signage-only, nothing assigned yet. Reaches nothing. */
export const EMPTY_SIGNAGE_SCOPE: SignageScope = {
  all: false,
  siteIds: new Set(),
  screenIds: new Set(),
  screenSiteIds: new Set(),
}

export async function resolveSignageScope(
  service: SupabaseClient,
  user: TeamUser,
): Promise<SignageScope> {
  if (isManagerRole(user.role)) return FULL_SIGNAGE_SCOPE

  const [siteRes, screenRes, teamRes] = await Promise.all([
    service.from('signage_site_access').select('site_id').eq('team_id', user.id),
    service.from('signage_screen_access').select('screen_id').eq('team_id', user.id),
    service.from('team').select('signage_role').eq('id', user.id).maybeSingle(),
  ])

  // Fail closed on a lookup error rather than silently widening to "all".
  if (siteRes.error || screenRes.error) {
    throw new Error('Failed to resolve signage access')
  }

  const siteIds = new Set<string>((siteRes.data || []).map((r) => r.site_id as string))
  const screenIds = new Set<string>((screenRes.data || []).map((r) => r.screen_id as string))

  if (siteIds.size === 0 && screenIds.size === 0) {
    // The legacy "no grants = everything" fallback protects people who predate
    // the access model. A signage-only editor cannot predate it, so for them
    // unassigned means unassigned.
    return teamRes.data?.signage_role === 'editor' ? EMPTY_SIGNAGE_SCOPE : FULL_SIGNAGE_SCOPE
  }

  const screenSiteIds = new Set<string>()
  if (screenIds.size > 0) {
    const { data } = await service
      .from('signage_screens')
      .select('site_id')
      .in('id', Array.from(screenIds))
    for (const row of data || []) {
      if (row.site_id) screenSiteIds.add(row.site_id as string)
    }
  }

  return { all: false, siteIds, screenIds, screenSiteIds }
}

/** Full run of a site: create screens, edit areas, branding, wayfinding, go live. */
export function canManageWholeSite(scope: SignageScope, siteId: string | null | undefined): boolean {
  if (scope.all) return true
  if (!siteId) return false
  return scope.siteIds.has(siteId)
}

/** Reach into a site at all — includes screen-scoped users, who get read of the shell. */
export function canAccessSite(scope: SignageScope, siteId: string | null | undefined): boolean {
  if (scope.all) return true
  if (!siteId) return true // legacy unscoped rows
  return scope.siteIds.has(siteId) || scope.screenSiteIds.has(siteId)
}

/** One screen, by id. `siteId` is the screen's own site when known. */
export function canAccessScreen(
  scope: SignageScope,
  screenId: string | null | undefined,
  siteId?: string | null,
): boolean {
  if (scope.all) return true
  if (!screenId) return false
  if (scope.screenIds.has(screenId)) return true
  return Boolean(siteId && scope.siteIds.has(siteId))
}

/** True when this user only holds screen grants in the given site. */
export function isScreenScopedForSite(scope: SignageScope, siteId: string | null | undefined): boolean {
  if (scope.all) return false
  if (!siteId) return false
  return !scope.siteIds.has(siteId) && scope.screenSiteIds.has(siteId)
}

export type SignageTargeting = {
  all_screens?: boolean | null
  target_screen_ids?: string[] | null
  target_area_ids?: string[] | null
  target_buildings?: string[] | null
}

/**
 * Can this user aim a content/announcement row at this target set?
 *
 * A screen-scoped user may only target their own screens explicitly — no
 * all-screens, no area targeting, no building targeting, since each of those
 * would spill onto screens they were not given.
 */
export function canTargetScreens(
  scope: SignageScope,
  siteId: string | null | undefined,
  targeting: SignageTargeting,
): { ok: true } | { ok: false; reason: string } {
  if (scope.all) return { ok: true }
  // An unscoped row has no site to check against, so a granted user can't own
  // it. Only managers and legacy no-grant users (scope.all) may touch those.
  if (!siteId) return { ok: false, reason: 'This content is not attached to a location.' }
  if (canManageWholeSite(scope, siteId)) return { ok: true }
  if (!isScreenScopedForSite(scope, siteId)) {
    return { ok: false, reason: 'You do not have access to this location.' }
  }

  if (targeting.all_screens) {
    return { ok: false, reason: 'You can only publish to the screens assigned to you, not all screens.' }
  }
  if (targeting.target_area_ids?.length) {
    return { ok: false, reason: 'You can only target your own screens, not a whole area.' }
  }
  if (targeting.target_buildings?.length) {
    return { ok: false, reason: 'You can only target your own screens, not a whole building.' }
  }

  const targets = targeting.target_screen_ids || []
  if (targets.length === 0) {
    return { ok: false, reason: 'Pick at least one of your screens to publish to.' }
  }
  const stray = targets.filter((id) => !scope.screenIds.has(id))
  if (stray.length > 0) {
    return { ok: false, reason: 'That includes a screen you do not have access to.' }
  }
  return { ok: true }
}
