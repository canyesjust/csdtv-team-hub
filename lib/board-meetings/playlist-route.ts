import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { assertBoardMeetingProduction } from '@/lib/board-meetings/meeting-api'
import { notifyBoardOutputsForMeeting } from '@/lib/board-meetings/output-realtime'

export type PlaylistContext = {
  service: SupabaseClient
  productionId: string
  boardMeetingId: string
}

type PlaylistContextOptions = {
  notifyOutputs?: boolean
}

export async function withPlaylistContext(
  productionId: string,
  handler: (ctx: PlaylistContext) => Promise<NextResponse>,
  options: PlaylistContextOptions = {},
): Promise<NextResponse> {
  const notifyOutputs = options.notifyOutputs !== false
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const prodCheck = await assertBoardMeetingProduction(service, productionId)
  if ('error' in prodCheck) {
    return NextResponse.json({ error: prodCheck.error }, { status: prodCheck.status || 400 })
  }

  const { data: bm } = await service
    .from('board_meetings')
    .select('id')
    .eq('production_id', productionId)
    .maybeSingle()

  if (!bm) return NextResponse.json({ error: 'Board meeting not found' }, { status: 404 })

  const response = await handler({ service, productionId, boardMeetingId: bm.id })
  if (notifyOutputs && response.status >= 200 && response.status < 300) {
    void notifyBoardOutputsForMeeting(service, bm.id).catch(() => {})
  }
  return response
}

export function playlistError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}
