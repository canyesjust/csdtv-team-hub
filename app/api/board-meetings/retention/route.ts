import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isStaffOrManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const RETENTION_MONTHS = 12

function cutoffIso(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - RETENTION_MONTHS)
  return d.toISOString()
}

/** Board meetings whose meeting date is older than the retention window. */
async function oldBoardMeetings(service: SupabaseClient, cutoff: string) {
  const { data: prods } = await service
    .from('productions')
    .select('id, start_datetime, event_date')
    .eq('request_type_number', 4)
  const oldProdIds = (prods || [])
    .filter(p => {
      const date = p.start_datetime ?? p.event_date
      return date && new Date(date).toISOString() < cutoff
    })
    .map(p => p.id)
  if (oldProdIds.length === 0) return [] as { id: string }[]

  const { data: bms } = await service
    .from('board_meetings')
    .select('id')
    .in('production_id', oldProdIds)
  return (bms || []) as { id: string }[]
}

async function countIn(service: SupabaseClient, table: string, column: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const { count } = await service.from(table).select('id', { count: 'exact', head: true }).in(column, ids)
  return count ?? 0
}

// GET = preview what would be cleaned up. POST = actually purge.
export async function GET() {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const cutoff = cutoffIso()
  const bmIds = (await oldBoardMeetings(service, cutoff)).map(b => b.id)

  const { data: motions } = bmIds.length
    ? await service.from('meeting_motions').select('id').in('board_meeting_id', bmIds)
    : { data: [] as { id: string }[] }
  const motionIds = (motions || []).map(m => m.id)

  const [attendance, timers, events, votes] = await Promise.all([
    countIn(service, 'meeting_attendance', 'board_meeting_id', bmIds),
    countIn(service, 'meeting_timers', 'board_meeting_id', bmIds),
    countIn(service, 'meeting_event_log', 'board_meeting_id', bmIds),
    countIn(service, 'meeting_motion_votes', 'motion_id', motionIds),
  ])

  return NextResponse.json({
    retention_months: RETENTION_MONTHS,
    cutoff,
    eligible_meetings: bmIds.length,
    counts: { attendance, timers, events, motions: motionIds.length, votes },
  })
}

export async function POST() {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaffOrManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const cutoff = cutoffIso()
  const bmIds = (await oldBoardMeetings(service, cutoff)).map(b => b.id)
  if (bmIds.length === 0) return NextResponse.json({ success: true, eligible_meetings: 0 })

  // Operational data only — the meeting, agenda, and recording link are kept.
  const { data: motions } = await service.from('meeting_motions').select('id').in('board_meeting_id', bmIds)
  const motionIds = (motions || []).map(m => m.id)
  if (motionIds.length > 0) {
    await service.from('meeting_motion_votes').delete().in('motion_id', motionIds)
  }
  await service.from('meeting_motions').delete().in('board_meeting_id', bmIds)
  await service.from('meeting_attendance').delete().in('board_meeting_id', bmIds)
  await service.from('meeting_timers').delete().in('board_meeting_id', bmIds)
  await service.from('meeting_event_log').delete().in('board_meeting_id', bmIds)
  await service.from('meeting_broadcast_state').delete().in('board_meeting_id', bmIds)

  return NextResponse.json({ success: true, eligible_meetings: bmIds.length })
}
