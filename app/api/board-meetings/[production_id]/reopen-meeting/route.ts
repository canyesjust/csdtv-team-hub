import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { assertBoardMeetingProduction } from '@/lib/board-meetings/meeting-api'
import { reopenMeeting } from '@/lib/board-meetings/meeting-lifecycle'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { production_id } = await params
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const prodCheck = await assertBoardMeetingProduction(service, production_id)
  if ('error' in prodCheck) {
    return NextResponse.json({ error: prodCheck.error }, { status: prodCheck.status || 400 })
  }

  const { data: bm } = await service
    .from('board_meetings')
    .select('id')
    .eq('production_id', production_id)
    .maybeSingle()

  if (!bm) return NextResponse.json({ error: 'Board meeting not found' }, { status: 404 })

  try {
    await reopenMeeting(service, bm.id, teamUser.id)
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Reopen failed' },
      { status: 400 },
    )
  }
}
