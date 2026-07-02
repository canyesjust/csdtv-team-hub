import { NextResponse } from 'next/server'
import { withBoardMeetingProduction } from '@/lib/board-meetings/production-route'
import { loadBoardMeetingBundle } from '@/lib/board-meetings/meeting-api'
import { ensureBoardMeetingRow } from '@/lib/board-meetings/persist-agenda'
import { isValidHttpUrl } from '@/lib/board-meetings/qr-control'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  // Read-only: any authenticated team user may load the bundle.
  return withBoardMeetingProduction(params, async ({ service, productionId }) => {
    const bundle = await loadBoardMeetingBundle(service, productionId)
    if (!bundle) return NextResponse.json({ board_meeting: null, items: [] })

    const { data: prod } = await service
      .from('productions')
      .select('production_number, livestream_url, title, start_datetime, event_date')
      .eq('id', productionId)
      .maybeSingle()

    return NextResponse.json({ ...bundle, production: prod })
  }, { requireStaff: false })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  return withBoardMeetingProduction(params, async ({ service, productionId }) => {
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
      await ensureBoardMeetingRow(service, productionId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not create board meeting'
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    const { data: bm, error } = await service
      .from('board_meetings')
      .update(patch)
      .eq('production_id', productionId)
      .select('*')
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!bm) return NextResponse.json({ error: 'Board meeting not found' }, { status: 404 })

    return NextResponse.json({ board_meeting: bm })
  })
}
