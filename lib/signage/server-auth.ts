import { getAuthenticatedTeamUser, isManagerRole, type TeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/**
 * Mirror of SQL `signage_can_access_site` for service-role write routes.
 * Managers: all sites. No grants: all sites (legacy). With grants: only those sites.
 * Null site_id is allowed (legacy unscoped rows).
 */
export async function assertCanAccessSignageSite(
  service: SupabaseClient,
  user: TeamUser,
  siteId: string | null | undefined,
): Promise<{ ok: true } | { error: NextResponse }> {
  if (!siteId) return { ok: true }
  if (isManagerRole(user.role)) return { ok: true }

  const { data: grants, error } = await service
    .from('signage_site_access')
    .select('site_id')
    .eq('team_id', user.id)
  if (error) {
    return { error: NextResponse.json({ error: 'Failed to check site access' }, { status: 500 }) }
  }
  if (!grants || grants.length === 0) return { ok: true }
  if (grants.some((g) => g.site_id === siteId)) return { ok: true }
  return { error: NextResponse.json({ error: 'Forbidden for this site' }, { status: 403 }) }
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
