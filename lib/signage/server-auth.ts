import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { NextResponse } from 'next/server'

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
