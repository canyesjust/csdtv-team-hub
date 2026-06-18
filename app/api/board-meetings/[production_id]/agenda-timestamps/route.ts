import { NextResponse } from 'next/server'
import { withControlContext, controlError } from '@/lib/board-meetings/control-route'

export const dynamic = 'force-dynamic'

const LIVE_EVENT_TYPES = ['meeting_went_live', 'go_live']
const ADVANCE_EVENT_TYPES = ['agenda_item_advanced', 'advance', 'jump_to']

// GET — agenda items with both their auto-detected offset (from live events) and
// any saved manual override, plus the meeting's recording URL for the editor.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  return withControlContext(
    production_id,
    async ({ service, boardMeetingId, productionId }) => {
      const [{ data: prod }, { data: bm }, { data: itemRows }, { data: events }] = await Promise.all([
        service.from('productions').select('livestream_url').eq('id', productionId).maybeSingle(),
        service.from('board_meetings').select('live_started_at, scheduled_public_start').eq('id', boardMeetingId).maybeSingle(),
        service
          .from('board_meeting_agenda_items')
          .select('id, section_number, item_number, title, video_offset_seconds, consent_block')
          .eq('board_meeting_id', boardMeetingId)
          .eq('is_broadcastable', true)
          .order('sort_order', { ascending: true }),
        service
          .from('meeting_event_log')
          .select('event_type, event_data, occurred_at')
          .eq('board_meeting_id', boardMeetingId)
          .order('occurred_at', { ascending: true }),
      ])

      const liveEvent = (events || []).find(e => LIVE_EVENT_TYPES.includes(e.event_type))
      const t0 = liveEvent
        ? new Date(liveEvent.occurred_at).getTime()
        : bm?.live_started_at
          ? new Date(bm.live_started_at).getTime()
          : bm?.scheduled_public_start
            ? new Date(bm.scheduled_public_start).getTime()
            : null

      const autoByItem = new Map<string, number>()
      for (const ev of events || []) {
        if (!ADVANCE_EVENT_TYPES.includes(ev.event_type) || t0 == null) continue
        const data = ev.event_data as { agenda_item_id?: string } | null
        const itemId = data?.agenda_item_id
        if (!itemId || autoByItem.has(itemId)) continue
        const offset = Math.floor((new Date(ev.occurred_at).getTime() - t0) / 1000)
        if (offset >= 0) autoByItem.set(itemId, offset)
      }

      const items = (itemRows || []).map(it => ({
        id: it.id as string,
        label: `${it.section_number ?? ''}${it.item_number ?? ''}`,
        title: it.consent_block ? 'Consent Agenda' : (it.title as string),
        auto_offset_seconds: autoByItem.has(it.id) ? autoByItem.get(it.id)! : null,
        override_seconds: typeof it.video_offset_seconds === 'number' ? it.video_offset_seconds : null,
      }))

      return NextResponse.json({ youtube_url: prod?.livestream_url ?? null, items })
    },
    { notifyOutputs: false },
  )
}

// POST — set or clear one item's manual timestamp override. { item_id, offset_seconds | null }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ production_id: string }> },
) {
  const { production_id } = await params
  const body = (await request.json().catch(() => ({}))) as { item_id?: string; offset_seconds?: number | null }
  if (!body.item_id) return controlError('item_id required')
  const value =
    body.offset_seconds == null || Number.isNaN(Number(body.offset_seconds))
      ? null
      : Math.max(0, Math.round(Number(body.offset_seconds)))

  return withControlContext(
    production_id,
    async ({ service, boardMeetingId }) => {
      const { error } = await service
        .from('board_meeting_agenda_items')
        .update({ video_offset_seconds: value })
        .eq('id', body.item_id)
        .eq('board_meeting_id', boardMeetingId)
      if (error) return controlError(error.message, 500)
      return NextResponse.json({ success: true, offset_seconds: value })
    },
    { notifyOutputs: false },
  )
}
