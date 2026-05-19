import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { assertBoardMeetingProduction, loadBoardMeetingBundle } from '@/lib/board-meetings/meeting-api'

export const dynamic = 'force-dynamic'

export async function GET(
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

  const bundle = await loadBoardMeetingBundle(service, production_id)
  if (!bundle) return NextResponse.json({ board_meeting: null, items: [] })

  const { data: prod } = await service
    .from('productions')
    .select('production_number, livestream_url, title')
    .eq('id', production_id)
    .maybeSingle()

  return NextResponse.json({ ...bundle, production: prod })
}
