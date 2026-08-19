import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isStaffOrManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import {
  listProductionsForGraphics, guessEventType, guessSchoolCode, guessVenue, productionDate,
} from '@/lib/graphics/from-production'

export const dynamic = 'force-dynamic'

/**
 * Upcoming productions, pre-mapped to graphics fields. Creating a show from one
 * means the school, date, venue and event type are already filled in.
 */
export async function GET() {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaffOrManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const [productions, { data: schools }, { data: existing }] = await Promise.all([
    listProductionsForGraphics(service),
    service.from('schools').select('code, name, short_name'),
    service.from('graphics_shows').select('production_id').not('production_id', 'is', null),
  ])

  const taken = new Set((existing || []).map(s => s.production_id))
  const schoolList = schools || []

  return NextResponse.json({
    productions: productions.map(p => ({
      id: p.id,
      production_number: p.production_number,
      title: p.title,
      status: p.status,
      starts_at: productionDate(p),
      start_datetime: p.start_datetime,
      end_datetime: p.end_datetime,
      venue: guessVenue(p, schoolList),
      school_code: guessSchoolCode(p, schoolList),
      event_type: guessEventType(p),
      has_show: taken.has(p.id),
    })),
  })
}
