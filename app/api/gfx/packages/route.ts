import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isStaffOrManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { GRAPHICS_EVENT_TYPES } from '@/lib/graphics/types'

export const dynamic = 'force-dynamic'

/**
 * The saved looks. Filtered by event type by default, because a football
 * package on a choir concert is never what anybody meant.
 */
export async function GET(request: Request) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaffOrManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const eventType = new URL(request.url).searchParams.get('event_type')
  let query = service
    .from('graphics_packages')
    .select('id, name, event_type, template_ids, uses, updated_at')
    .order('uses', { ascending: false })
    .order('name')
  if (eventType && (GRAPHICS_EVENT_TYPES as readonly string[]).includes(eventType)) {
    query = query.eq('event_type', eventType)
  }

  const { data } = await query
  return NextResponse.json({ packages: data || [] })
}
