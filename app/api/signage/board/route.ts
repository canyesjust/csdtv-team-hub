import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { timingSafeEqualStr } from '@/lib/server/security'
import { checkRateLimit } from '@/lib/server/rate-limit'

export const dynamic = 'force-dynamic'

function bearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  return authHeader.slice(7).trim() || null
}

// Token-gated data for the public /signage broadcast board.
// Prefer Authorization: Bearer; still accept legacy ?k= for players that strip
// headers. Never public-CDN-cache — auth is not part of the URL cache key.
export async function GET(request: NextRequest) {
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server not configured' }, { status: 500 })

  const url = new URL(request.url)
  const token = (bearerToken(request) ?? url.searchParams.get('k') ?? '').trim()

  const { data: row } = await service
    .from('app_settings')
    .select('value')
    .eq('key', 'signage_board_token')
    .maybeSingle()
  const expected = ((row?.value as string | undefined) || '').trim()
  if (!expected || !token || !timingSafeEqualStr(token, expected)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  const rl = await checkRateLimit(request, {
    scope: 'signage_board_data',
    max: 120,
    windowMs: 60 * 1000,
  })
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rl.retryAfterSec),
          'Cache-Control': 'private, no-store',
        },
      },
    )
  }

  const start = (url.searchParams.get('start') || '').trim()
  const end = (url.searchParams.get('end') || '').trim()

  let goneQuery = service.from('schedule_gone_days').select('id, user_id, date')
  let closedQuery = service.from('schedule_office_closed_days').select('id, date, label')
  if (start && end) {
    goneQuery = goneQuery.gte('date', start).lte('date', end)
    closedQuery = closedQuery.gte('date', start).lte('date', end)
  }

  const [prods, team, defs, ovrs, schools, events, gone, closed] = await Promise.all([
    service
      .from('productions')
      .select('id, production_number, title, request_type_label, status, school_year, start_datetime, start_datetime_label, event_date, filming_location, school_department, deliverables_count, production_members(user_id, team(name, avatar_color))')
      .order('production_number'),
    service.from('team').select('id, name, avatar_color, role').eq('active', true),
    service.from('schedule_defaults').select('*'),
    service.from('schedule_overrides').select('*'),
    service.from('schools').select('code, name'),
    service.from('calendar_events').select('id, title, date, start_time, color').order('date'),
    goneQuery,
    closedQuery,
  ])

  return NextResponse.json(
    {
      productions: prods.data ?? [],
      team: team.data ?? [],
      schedDefaults: defs.data ?? [],
      schedOverrides: ovrs.data ?? [],
      schools: schools.data ?? [],
      calEvents: events.data ?? [],
      goneDays: gone.data ?? [],
      officeClosedDays: closed.data ?? [],
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
