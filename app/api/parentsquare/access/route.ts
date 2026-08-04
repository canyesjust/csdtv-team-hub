import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest) {
  const user = await getAuthenticatedTeamUser()
  if (!user || !isManagerRole(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const service = getServiceSupabaseClient()
  if (!service) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const body = await request.json()
  if (!body.team_id || typeof body.parentsquare_access !== 'boolean') {
    return NextResponse.json({ error: 'team_id and parentsquare_access required' }, { status: 400 })
  }

  const { error } = await service
    .from('team')
    .update({ parentsquare_access: body.parentsquare_access })
    .eq('id', body.team_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
