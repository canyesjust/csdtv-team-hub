import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { assertBoardMeetingProduction, loadBoardMeetingBundle } from '@/lib/board-meetings/meeting-api'
import { ensureBoardMeetingRow } from '@/lib/board-meetings/persist-agenda'
import { isValidHttpUrl } from '@/lib/board-meetings/qr-control'

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
    .select('production_number, livestream_url, title, start_datetime, event_date')
    .eq('id', production_id)
    .maybeSingle()

  return NextResponse.json({ ...bundle, production: prod })
}

export async function PATCH(
  request: Request,
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

  const body = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.public_agenda_url !== undefined) {
    const raw = body.public_agenda_url
    const url = raw === null || raw === '' ? null : String(raw).trim()
    if (url && !isValidHttpUrl(url)) {
      return NextResponse.json({ error: 'Public agenda URL must be http or https' }, { status: 400 })
    }
    patch.public_agenda_url = url
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  try {
    await ensureBoardMeetingRow(service, production_id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not create board meeting'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const { data: bm, error } = await service
    .from('board_meetings')
    .update(patch)
    .eq('production_id', production_id)
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!bm) return NextResponse.json({ error: 'Board meeting not found' }, { status: 404 })

  return NextResponse.json({ board_meeting: bm })
}
