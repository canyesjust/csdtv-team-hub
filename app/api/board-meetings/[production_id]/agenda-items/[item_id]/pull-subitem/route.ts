import { NextResponse } from 'next/server'
import { withBoardMeetingProduction } from '@/lib/board-meetings/production-route'

export const dynamic = 'force-dynamic'

type Sub = { item_number: string; title: string }

// Pull one member out of a Consent Agenda item so it can be discussed/voted on its
// own. Creates a standalone action item and removes it from the consent sub-items.
// Allowed during a live meeting (this is a floor action).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string; item_id: string }> },
) {
  return withBoardMeetingProduction(params, async ({ service, productionId, routeParams }) => {
    const { item_id } = routeParams

    const body = (await request.json().catch(() => ({}))) as { item_number?: string }
    const targetNumber = String(body.item_number ?? '')
    if (!targetNumber) return NextResponse.json({ error: 'item_number is required' }, { status: 400 })

    const { data: consent } = await service
      .from('board_meeting_agenda_items')
      .select('id, board_meeting_id, section_number, section_title, sort_order, subitems')
      .eq('id', item_id)
      .maybeSingle()
    if (!consent) return NextResponse.json({ error: 'Consent item not found' }, { status: 404 })

    // The item must belong to THIS production's board meeting — otherwise a
    // crafted item_id could reach into another meeting's agenda.
    const { data: bm } = await service
      .from('board_meetings')
      .select('id')
      .eq('production_id', productionId)
      .maybeSingle()
    if (!bm || bm.id !== consent.board_meeting_id) {
      return NextResponse.json({ error: 'Consent item not found' }, { status: 404 })
    }

    const subs: Sub[] = Array.isArray(consent.subitems) ? (consent.subitems as Sub[]) : []
    const target = subs.find(s => s.item_number === targetNumber)
    if (!target) return NextResponse.json({ error: 'Sub-item not found' }, { status: 404 })
    const remaining = subs.filter(s => s.item_number !== targetNumber)

    // Make room right after the consent item.
    const { data: after } = await service
      .from('board_meeting_agenda_items')
      .select('id, sort_order')
      .eq('board_meeting_id', consent.board_meeting_id)
      .gt('sort_order', consent.sort_order)
      .order('sort_order', { ascending: true })
    for (const row of after || []) {
      await service.from('board_meeting_agenda_items').update({ sort_order: (row.sort_order as number) + 1 }).eq('id', row.id)
    }

    const { data: created, error: insErr } = await service
      .from('board_meeting_agenda_items')
      .insert({
        board_meeting_id: consent.board_meeting_id,
        section_number: consent.section_number,
        section_title: consent.section_title,
        item_number: target.item_number,
        sort_order: (consent.sort_order as number) + 1,
        title: target.title,
        original_title: target.title,
        type: 'action',
        action_requested: true,
        is_broadcastable: true,
        consent_block: null,
        suggested_motion_text: `Move to approve ${target.title}.`,
      })
      .select('id')
      .single()
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

    // Update the consent item: drop the pulled member + re-list the motion text.
    const listed = remaining.map(s => `${s.item_number}. ${s.title}`).join('; ')
    await service
      .from('board_meeting_agenda_items')
      .update({
        subitems: remaining,
        suggested_motion_text: remaining.length ? `Move to approve the Consent Agenda: ${listed}.` : 'Move to approve the Consent Agenda.',
        updated_at: new Date().toISOString(),
      })
      .eq('id', consent.id)

    return NextResponse.json({ success: true, new_item_id: created.id })
  })
}
