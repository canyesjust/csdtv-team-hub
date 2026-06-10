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
