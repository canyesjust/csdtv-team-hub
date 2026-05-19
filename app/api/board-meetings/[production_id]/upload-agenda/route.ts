import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import {
  assertBoardMeetingProduction,
  callExtractAgendaEdge,
  parseExtractedAgenda,
} from '@/lib/board-meetings/meeting-api'
import { ensureBoardMeetingRow, replaceAgendaItemsFromExtraction } from '@/lib/board-meetings/persist-agenda'
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

  const form = await request.formData()
  const file = form.get('pdf')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Missing PDF file' }, { status: 400 })
  }
  if (file.type && file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 })
  }
  const buf = Buffer.from(await file.arrayBuffer())
  if (buf.length > MAX_BYTES) {
    return NextResponse.json({ error: 'PDF must be 10 MB or smaller' }, { status: 413 })
  }

  const pdfBase64 = buf.toString('base64')

  try {
    const raw = await callExtractAgendaEdge(pdfBase64)
    const extracted = parseExtractedAgenda(raw)
    const bm = await ensureBoardMeetingRow(service, production_id)

    if (bm.id) {
      const { data: lockedRow } = await service
        .from('board_meetings')
        .select('agenda_locked')
        .eq('id', bm.id)
        .single()
      if (lockedRow?.agenda_locked) {
        return NextResponse.json({ error: 'Agenda is locked. Use re-upload instead.' }, { status: 400 })
      }
    }

    await replaceAgendaItemsFromExtraction(service, bm.id, extracted)
    const items = enrichExtractedItems(extracted)

    return NextResponse.json({
      extracted,
      items,
      board_meeting_id: bm.id,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Extraction failed'
    const isTimeout = e instanceof Error && e.name === 'AbortError'
    return NextResponse.json(
      { error: isTimeout ? 'Extraction timed out. Try again.' : msg },
      { status: isTimeout ? 504 : 500 },
    )
  }
}
