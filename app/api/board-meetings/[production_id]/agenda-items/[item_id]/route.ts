import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { assertBoardMeetingProduction } from '@/lib/board-meetings/meeting-api'
import { normalizeAgendaType } from '@/lib/board-meetings/extraction'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ production_id: string; item_id: string }> },
) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { production_id, item_id } = await params
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const prodCheck = await assertBoardMeetingProduction(service, production_id)
  if ('error' in prodCheck) {
    return NextResponse.json({ error: prodCheck.error }, { status: prodCheck.status || 400 })
  }

  const { data: bm } = await service
    .from('board_meetings')
    .select('id, agenda_locked')
    .eq('production_id', production_id)
    .maybeSingle()

  if (!bm) return NextResponse.json({ error: 'Board meeting not found' }, { status: 404 })
  if (bm.agenda_locked) {
    return NextResponse.json({ error: 'Agenda is locked' }, { status: 400 })
  }

  const { data: item } = await service
    .from('board_meeting_agenda_items')
    .select('id')
    .eq('id', item_id)
    .eq('board_meeting_id', bm.id)
    .maybeSingle()

  if (!item) return NextResponse.json({ error: 'Agenda item not found' }, { status: 404 })

  const body = await request.json()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  const fields = [
    'section_number', 'section_title', 'item_number', 'sort_order', 'title', 'original_title',
    'type', 'action_requested', 'is_broadcastable', 'consent_block', 'notes', 'subitems',
    'needs_review', 'review_notes',
  ] as const

  for (const f of fields) {
    if (body[f] !== undefined) patch[f] = body[f]
  }
  if (body.type !== undefined) patch.type = normalizeAgendaType(String(body.type))

  const { error } = await service
    .from('board_meeting_agenda_items')
    .update(patch)
    .eq('id', item_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (Array.isArray(body.presenters)) {
    await service.from('board_meeting_presenters').delete().eq('agenda_item_id', item_id)
    const presenters = body.presenters as { name: string; title?: string | null }[]
    if (presenters.length > 0) {
      await service.from('board_meeting_presenters').insert(
        presenters.map((p, j) => ({
          agenda_item_id: item_id,
          person_id: null,
          name: p.name,
          title: p.title ?? null,
          sort_order: j,
        })),
      )
    }
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ production_id: string; item_id: string }> },
) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { production_id, item_id } = await params
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const prodCheck = await assertBoardMeetingProduction(service, production_id)
  if ('error' in prodCheck) {
    return NextResponse.json({ error: prodCheck.error }, { status: prodCheck.status || 400 })
  }

  const { data: bm } = await service
    .from('board_meetings')
    .select('id, agenda_locked')
    .eq('production_id', production_id)
    .maybeSingle()

  if (!bm) return NextResponse.json({ error: 'Board meeting not found' }, { status: 404 })
  if (bm.agenda_locked) {
    return NextResponse.json({ error: 'Agenda is locked' }, { status: 400 })
  }

  const { error } = await service
    .from('board_meeting_agenda_items')
    .delete()
    .eq('id', item_id)
    .eq('board_meeting_id', bm.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: remaining } = await service
    .from('board_meeting_agenda_items')
    .select('id')
    .eq('board_meeting_id', bm.id)
    .order('sort_order', { ascending: true })

  for (let i = 0; i < (remaining || []).length; i++) {
    await service
      .from('board_meeting_agenda_items')
      .update({ sort_order: i, updated_at: new Date().toISOString() })
      .eq('id', remaining![i].id)
  }

  return NextResponse.json({ success: true })
}
