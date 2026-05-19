import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ person_id: string }> },
) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { person_id } = await params
  const url = new URL(request.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  const { data: votes } = await service
    .from('meeting_motion_votes')
    .select('vote, recorded_at, motion_id')
    .eq('person_id', person_id)
    .is('superseded_by_vote_id', null)
    .order('recorded_at', { ascending: false })

  if (!votes?.length) return NextResponse.json({ records: [] })

  const motionIds = [...new Set(votes.map(v => v.motion_id))]
  const { data: motions } = await service
    .from('meeting_motions')
    .select('id, motion_text, result, voted_at, board_meeting_id')
    .in('id', motionIds)

  const bmIds = [...new Set((motions || []).map(m => m.board_meeting_id))]
  const { data: meetings } = await service
    .from('board_meetings')
    .select('id, production_id')
    .in('id', bmIds)

  const prodIds = [...new Set((meetings || []).map(m => m.production_id))]
  const { data: prods } = await service
    .from('productions')
    .select('id, production_number, title, start_datetime')
    .in('id', prodIds)

  const motionMap = new Map((motions || []).map(m => [m.id, m]))
  const bmToProd = new Map((meetings || []).map(m => [m.id, m.production_id]))
  const prodMap = new Map((prods || []).map(p => [p.id, p]))

  const records = []
  for (const v of votes) {
    const motion = motionMap.get(v.motion_id)
    if (!motion) continue
    const prodId = bmToProd.get(motion.board_meeting_id)
    const prod = prodId ? prodMap.get(prodId) : undefined
    const date = prod?.start_datetime
    if (from && date && date < from) continue
    if (to && date && date > to) continue
    const pn = prod?.production_number
    records.push({
      motion_id: motion.id,
      motion_text: motion.motion_text,
      result: motion.result,
      vote: v.vote,
      voted_at: motion.voted_at,
      production_number: pn ?? null,
      meeting_title: prod?.title ?? null,
      meeting_date: date ?? null,
      archive_url: pn != null ? `/board/meeting/${pn}/archive` : null,
    })
  }

  return NextResponse.json({ records })
}
