import { NextResponse } from 'next/server'
import { getAuthenticatedTeamUser, isStaffOrManagerRole } from '@/lib/server/auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { clearBoardMemberPeopleCache } from '@/lib/board-meetings/control-meeting-cache'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaffOrManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const body = await request.json()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const fields = [
    'display_name', 'primary_title', 'affiliation', 'photo_path', 'alternate_titles',
    'category', 'officer_position', 'is_active', 'group_label',
  ] as const
  for (const f of fields) {
    if (body[f] !== undefined) patch[f] = body[f]
  }

  const { data, error } = await service
    .from('lower_third_people')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  clearBoardMemberPeopleCache()
  return NextResponse.json({ person: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const teamUser = await getAuthenticatedTeamUser()
  if (!teamUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaffOrManagerRole(teamUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const service = getServiceSupabaseClient()
  if (!service) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data: lockedRefs } = await service
    .from('board_meeting_presenters')
    .select('id, agenda_item_id')
    .eq('person_id', id)

  if (lockedRefs && lockedRefs.length > 0) {
    const itemIds = [...new Set(lockedRefs.map(r => r.agenda_item_id))]
    const { data: items } = await service
      .from('board_meeting_agenda_items')
      .select('id, board_meeting_id')
      .in('id', itemIds)

    if (items && items.length > 0) {
      const bmIds = [...new Set(items.map(i => i.board_meeting_id))]
      const { data: meetings } = await service
        .from('board_meetings')
        .select('id, agenda_locked')
        .in('id', bmIds)
        .eq('agenda_locked', true)

      if (meetings && meetings.length > 0) {
        return NextResponse.json({
          error: 'This person is a presenter on locked agenda items. Remove the references first.',
        }, { status: 409 })
      }
    }
  }

  const { error } = await service.from('lower_third_people').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  clearBoardMemberPeopleCache()
  return NextResponse.json({ success: true })
}
