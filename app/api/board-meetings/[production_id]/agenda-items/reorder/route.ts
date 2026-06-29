import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isStaffOrManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { assertBoardMeetingProduction } from '@/lib/board-meetings/meeting-api'
import {
  canEditAgendaWhileLocked,
  mergeBroadcastableReorder,
} from '@/lib/board-meetings/agenda-live-edit'
import { clearLockedAgendaCache } from '@/lib/board-meetings/control-meeting-cache'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaffOrManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { production_id } = await params
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const prodCheck = await assertBoardMeetingProduction(service, production_id)
  if ('error' in prodCheck) {
    return NextResponse.json({ error: prodCheck.error }, { status: prodCheck.status || 400 })
  }

  const { data: bm } = await service
    .from('board_meetings')
    .select('id, agenda_locked, broadcast_status')
    .eq('production_id', production_id)
    .maybeSingle()

  if (!bm) return NextResponse.json({ error: 'Board meeting not found' }, { status: 404 })
  if (bm.agenda_locked && !canEditAgendaWhileLocked(bm.broadcast_status)) {
    return NextResponse.json({ error: 'Agenda is locked' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const orderedIdsInput = body?.ordered_ids
  if (!Array.isArray(orderedIdsInput) || orderedIdsInput.length === 0) {
    return NextResponse.json({ error: 'ordered_ids required' }, { status: 400 })
  }

  const { data: existing } = await service
    .from('board_meeting_agenda_items')
    .select('id, sort_order, is_broadcastable')
    .eq('board_meeting_id', bm.id)
    .order('sort_order', { ascending: true })

  const allItems = existing || []
  const existingIds = new Set(allItems.map(r => r.id))

  let orderedIds: string[]

  if (bm.agenda_locked && body?.broadcastable_only) {
    try {
      orderedIds = mergeBroadcastableReorder(allItems, orderedIdsInput as string[])
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Invalid reorder' },
        { status: 400 },
      )
    }
  } else {
    orderedIds = orderedIdsInput as string[]
    if (orderedIds.length !== existingIds.size || !orderedIds.every((id: string) => existingIds.has(id))) {
      return NextResponse.json({ error: 'ordered_ids must include every agenda item exactly once' }, { status: 400 })
    }
  }

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await service
      .from('board_meeting_agenda_items')
      .update({ sort_order: i, updated_at: new Date().toISOString() })
      .eq('id', orderedIds[i])
      .eq('board_meeting_id', bm.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (bm.agenda_locked) clearLockedAgendaCache(bm.id)

  return NextResponse.json({ success: true })
}
