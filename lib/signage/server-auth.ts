import { getAuthenticatedTeamUser, isManagerRole, type TeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import {
  canAccessScreen,
  canAccessSite,
  canManageWholeSite,
  canTargetScreens,
  isScreenScopedForSite,
  resolveSignageScope,
  type SignageScope,
  type SignageTargeting,
} from '@/lib/signage/access-scope'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export type { SignageScope } from '@/lib/signage/access-scope'

const FORBIDDEN_SITE = 'You do not have access to this location.'
const FORBIDDEN_SCREEN = 'You do not have access to this screen.'

function forbid(message: string) {
  return { error: NextResponse.json({ error: message }, { status: 403 }) }
}

async function scopeOrError(
  service: SupabaseClient,
  user: TeamUser,
): Promise<{ scope: SignageScope } | { error: NextResponse }> {
  try {
    return { scope: await resolveSignageScope(service, user) }
  } catch {
    return { error: NextResponse.json({ error: 'Failed to check signage access' }, { status: 500 }) }
  }
}

/**
 * Site-wide write gate. Passing means the caller runs the WHOLE location:
 * areas, wayfinding, visitors, branding, live takeover, creating screens.
 *
 * A screen-scoped user (signage_screen_access only) FAILS this on purpose —
 * they may touch their own screen and its content, nothing site-wide. Every
 * route that guards a site-level resource should call this.
 */
export async function assertCanManageSignageSite(
  service: SupabaseClient,
  user: TeamUser,
  siteId: string | null | undefined,
): Promise<{ ok: true } | { error: NextResponse }> {
  if (isManagerRole(user.role)) return { ok: true }
  const resolved = await scopeOrError(service, user)
  if ('error' in resolved) return resolved
  // Managers and legacy no-grant users (scope.all) may still touch rows that
  // predate the site model. Anyone holding a grant may not: a row with no site
  // sits outside every access policy, so "no site" must not read as "allowed".
  if (!siteId) {
    return resolved.scope.all
      ? { ok: true }
      : forbid('This item is not attached to a location.')
  }
  return canManageWholeSite(resolved.scope, siteId) ? { ok: true } : forbid(FORBIDDEN_SITE)
}

/**
 * Historical name, kept so the existing site-level routes keep compiling.
 * Same strict meaning as assertCanManageSignageSite — fail closed for
 * screen-scoped users. Use the explicit name in new code.
 */
export const assertCanAccessSignageSite = assertCanManageSignageSite

/**
 * Read gate for a site's shell (branding, ticker, wayfinding, screen list).
 * Screen-scoped users PASS for the site their screen lives in.
 */
export async function assertCanReadSignageSite(
  service: SupabaseClient,
  user: TeamUser,
  siteId: string | null | undefined,
): Promise<{ ok: true } | { error: NextResponse }> {
  if (isManagerRole(user.role)) return { ok: true }
  const resolved = await scopeOrError(service, user)
  if ('error' in resolved) return resolved
  if (!siteId) {
    return resolved.scope.all
      ? { ok: true }
      : forbid('This item is not attached to a location.')
  }
  return canAccessSite(resolved.scope, siteId) ? { ok: true } : forbid(FORBIDDEN_SITE)
}

/** One screen, by id. Passes for managers, site owners, and that screen's grantee. */
export async function assertCanAccessSignageScreen(
  service: SupabaseClient,
  user: TeamUser,
  screenId: string | null | undefined,
): Promise<{ ok: true } | { error: NextResponse }> {
  if (!screenId) return forbid(FORBIDDEN_SCREEN)
  if (isManagerRole(user.role)) return { ok: true }
  const resolved = await scopeOrError(service, user)
  if ('error' in resolved) return resolved
  const { data: screen } = await service
    .from('signage_screens')
    .select('id, site_id')
    .eq('id', screenId)
    .maybeSingle()
  if (!screen) return forbid(FORBIDDEN_SCREEN)
  return canAccessScreen(resolved.scope, screen.id as string, screen.site_id as string | null)
    ? { ok: true }
    : forbid(FORBIDDEN_SCREEN)
}

/**
 * Screen fields a screen-scoped editor may change on their own screen. They get
 * how it LOOKS (layout, theme, orientation, zone config) but not where it sits
 * or what it opts into: `area_id` and `building` decide which area- and
 * building-targeted content lands on it, and changing them would widen their own
 * read scope, since signage_my_screen_area_ids() reads those very columns.
 */
export async function assertCanEditScreenFields(
  service: SupabaseClient,
  user: TeamUser,
  screenId: string,
  fields: string[],
): Promise<{ ok: true } | { error: NextResponse }> {
  if (isManagerRole(user.role)) return { ok: true }
  const resolved = await scopeOrError(service, user)
  if ('error' in resolved) return resolved
  const { scope } = resolved
  if (scope.all) return { ok: true }

  // Per SITE, not globally: someone can run all of location A and hold a single
  // screen in location B. Holding a site grant somewhere must not unlock the
  // full field set on a screen they only hold individually.
  const { data: screen } = await service
    .from('signage_screens')
    .select('site_id')
    .eq('id', screenId)
    .maybeSingle()
  if (!screen) return forbid(FORBIDDEN_SCREEN)
  if (!isScreenScopedForSite(scope, screen.site_id as string | null)) return { ok: true }

  const SCREEN_SCOPED_FIELDS = new Set([
    'id', 'name', 'orientation', 'layout', 'theme', 'webpage_url',
    'wayfinding_heading', 'notes', 'zone_config',
  ])
  const blocked = fields.filter((f) => !SCREEN_SCOPED_FIELDS.has(f))
  if (blocked.length === 0) return { ok: true }
  return forbid(
    `You can change how this screen looks, but not ${blocked.join(', ')}. Ask a signage manager.`,
  )
}

/** Same, keyed by the screen's public code (used by /api/signage/push/[code]). */
export async function assertCanAccessSignageScreenCode(
  service: SupabaseClient,
  user: TeamUser,
  code: string | null | undefined,
): Promise<{ ok: true } | { error: NextResponse }> {
  if (!code) return forbid(FORBIDDEN_SCREEN)
  if (isManagerRole(user.role)) return { ok: true }
  const { data: screen } = await service
    .from('signage_screens')
    .select('id')
    .eq('code', code)
    .maybeSingle()
  if (!screen) return forbid(FORBIDDEN_SCREEN)
  return assertCanAccessSignageScreen(service, user, screen.id as string)
}

/**
 * Content / announcement targeting. Site owners may aim anywhere in their site.
 * Screen-scoped users may only name their own screens explicitly — no
 * all-screens, no area or building targeting.
 */
export async function assertCanTargetSignageScreens(
  service: SupabaseClient,
  user: TeamUser,
  siteId: string | null | undefined,
  targeting: SignageTargeting,
): Promise<{ ok: true } | { error: NextResponse }> {
  if (isManagerRole(user.role)) return { ok: true }
  const resolved = await scopeOrError(service, user)
  if ('error' in resolved) return resolved
  const verdict = canTargetScreens(resolved.scope, siteId, targeting)
  return verdict.ok ? { ok: true } : forbid(verdict.reason)
}

/** Resolved scope for a route that needs to filter rather than just allow/deny. */
export async function getSignageScope(
  service: SupabaseClient,
  user: TeamUser,
): Promise<{ scope: SignageScope } | { error: NextResponse }> {
  if (isManagerRole(user.role)) {
    return { scope: { all: true, siteIds: new Set(), screenIds: new Set(), screenSiteIds: new Set() } }
  }
  return scopeOrError(service, user)
}

/** Look up site_id on a row before mutate/delete. */
export async function loadSignageRowSiteId(
  service: SupabaseClient,
  table:
    | 'signage_areas'
    | 'signage_screens'
    | 'signage_content'
    | 'signage_announcements'
    | 'signage_wayfinding'
    | 'signage_visitors',
  id: string,
): Promise<string | null | undefined> {
  const { data } = await service.from(table).select('site_id').eq('id', id).maybeSingle()
  return data?.site_id as string | null | undefined
}

export async function requireManagerApi() {
  const user = await getAuthenticatedTeamUser()
  if (!user || !isManagerRole(user.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  const service = getServiceSupabaseClient()
  if (!service) {
    return { error: NextResponse.json({ error: 'Server configuration error' }, { status: 500 }) }
  }
  return { user, service }
}

/**
 * Manager OR signage editor (signage_role = 'editor'). Use on signage CONTENT
 * routes (content, announcements, visitors, screens, areas, wayfinding, template,
 * settings, live). Do NOT use on admin routes (sites, access, approvers) — those
 * stay manager-only via requireManagerApi to prevent privilege escalation.
 *
 * This only answers "is this person a signage editor at all". WHICH sites and
 * screens they may touch is a separate question — pair it with
 * assertCanManageSignageSite / assertCanAccessSignageScreen.
 */
export async function requireSignageEditorApi() {
  const user = await getAuthenticatedTeamUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const service = getServiceSupabaseClient()
  if (!service) {
    return { error: NextResponse.json({ error: 'Server configuration error' }, { status: 500 }) }
  }
  if (isManagerRole(user.role)) {
    return { user, service }
  }
  const { data: teamRow } = await service
    .from('team')
    .select('signage_role')
    .eq('id', user.id)
    .maybeSingle()
  if (teamRow?.signage_role === 'editor') {
    return { user, service }
  }
  return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
}

/**
 * Signage editor who runs at least one whole LOCATION. Use on routes that touch
 * global or site-wide state with no site_id to check against — global settings,
 * the public board link, board-meeting takeover, push-all. A screen-scoped
 * editor is rejected: they hold screens, not locations.
 */
export async function requireSignageSiteManagerApi() {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth
  if (isManagerRole(auth.user.role)) return auth
  const resolved = await scopeOrError(auth.service, auth.user)
  if ('error' in resolved) return resolved
  if (resolved.scope.all || resolved.scope.siteIds.size > 0) return auth
  return forbid('This setting covers a whole location. Ask a signage manager to change it.')
}

export async function requireSignageApproverApi() {
  const user = await getAuthenticatedTeamUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const service = getServiceSupabaseClient()
  if (!service) {
    return { error: NextResponse.json({ error: 'Server configuration error' }, { status: 500 }) }
  }

  if (isManagerRole(user.role)) {
    return { user, service, isManager: true }
  }

  const { data: teamRow } = await service
    .from('team')
    .select('signage_approver')
    .eq('id', user.id)
    .maybeSingle()

  if (!teamRow?.signage_approver) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { user, service, isManager: false }
}
