import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import {
  assertBoardMeetingProduction,
  callExtractAgendaEdge,
  loadBoardMeetingBundle,
  parseExtractedAgenda,
} from '@/lib/board-meetings/meeting-api'
import { buildAgendaDiff } from '@/lib/board-meetings/agenda-diff'
import { enrichExtractedItems } from '@/lib/board-meetings/extraction'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_BYTES = 10 * 1024 * 1024

export async function POST(
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

  const bundle = await loadBoardMeetingBundle(service, production_id)
  if (!bundle.board_meeting?.agenda_locked) {
    return NextResponse.json({ error: 'Agenda is not locked' }, { status: 400 })
  }

  const form = await request.formData()
  const file = form.get('pdf')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Missing PDF file' }, { status: 400 })
  }
  const buf = Buffer.from(await file.arrayBuffer())
  if (buf.length > MAX_BYTES) {
    return NextResponse.json({ error: 'PDF must be 10 MB or smaller' }, { status: 413 })
  }

  try {
    const raw = await callExtractAgendaEdge(buf.toString('base64'))
    const extracted = parseExtractedAgenda(raw)
    const enriched = enrichExtractedItems(extracted)
    const diff = buildAgendaDiff(bundle.items, enriched)

    return NextResponse.json({
      diff,
      extracted,
      items: enriched,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Extraction failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
