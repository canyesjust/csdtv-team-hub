import type { SupabaseClient } from '@supabase/supabase-js'
import { formatOffsetSeconds } from '@/lib/board-meetings/time-format'

const LIVE_EVENT_TYPES = ['meeting_went_live', 'go_live']
const ADVANCE_EVENT_TYPES = ['agenda_item_advanced', 'advance', 'jump_to']

export async function buildArchivePayload(service: SupabaseClient, productionNumber: number) {
  const { data: prod } = await service
    .from('productions')
    .select('id, production_number, title, start_datetime, request_type_label, filming_location, event_location, livestream_url, status')
    .eq('production_number', productionNumber)
    .maybeSingle()

  if (!prod) return null

  const { data: bm } = await service.from('board_meetings').select('*').eq('production_id', prod.id).maybeSingle()

  if (!bm) {
    return {
      meeting: {
        title: prod.title,
        date: prod.start_datetime,
        type: prod.request_type_label,
        location: prod.event_location || prod.filming_location,
        scheduled_public_start: null,
        broadcast_status: 'none',
        youtube_url: prod.livestream_url,
        production_number: prod.production_number,
        cancelled: prod.status === 'Cancelled',
      },
      agenda: [],
      summary: { total_duration_seconds: 0, action_items_count: 0, presenters_count: 0, recess_count: 0 },
      not_board_meeting: true,
    }
  }

  const { data: itemRows } = await service
    .from('board_meeting_agenda_items')
    .select('*')
    .eq('board_meeting_id', bm.id)
    .eq('is_broadcastable', true)
    .order('sort_order', { ascending: true })

  const items = itemRows || []
  const ids = items.map(i => i.id)

  const [{ data: allPres }, { data: allDocs }, { data: events }] = await Promise.all([
    ids.length
      ? service.from('board_meeting_presenters').select('agenda_item_id, name, title').in('agenda_item_id', ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? service.from('board_meeting_agenda_documents').select('agenda_item_id, title, filename, source_url, sort_order').in('agenda_item_id', ids)
      : Promise.resolve({ data: [] }),
    service
      .from('meeting_event_log')
      .select('event_type, event_data, occurred_at')
      .eq('board_meeting_id', bm.id)
      .order('occurred_at', { ascending: true }),
  ])

  const liveEvent = (events || []).find(e => LIVE_EVENT_TYPES.includes(e.event_type))
  const t0 = liveEvent
    ? new Date(liveEvent.occurred_at).getTime()
    : bm.scheduled_public_start
      ? new Date(bm.scheduled_public_start).getTime()
      : null

  const firstAdvanceByItem = new Map<string, number>()
  for (const ev of events || []) {
    if (!ADVANCE_EVENT_TYPES.includes(ev.event_type) || !t0) continue
    const data = ev.event_data as { agenda_item_id?: string } | null
    const itemId = data?.agenda_item_id
    if (!itemId || firstAdvanceByItem.has(itemId)) continue
    const offset = Math.floor((new Date(ev.occurred_at).getTime() - t0) / 1000)
    if (offset >= 0) firstAdvanceByItem.set(itemId, offset)
  }

  const presByItem = new Map<string, { name: string; title: string | null }[]>()
  for (const p of allPres || []) {
    const list = presByItem.get(p.agenda_item_id) || []
    list.push({ name: p.name, title: p.title })
    presByItem.set(p.agenda_item_id, list)
  }

  const docsByItem = new Map<string, { title: string; filename: string; source_url: string | null }[]>()
  for (const d of allDocs || []) {
    const list = docsByItem.get(d.agenda_item_id) || []
    list.push({ title: d.title, filename: d.filename, source_url: d.source_url })
    docsByItem.set(d.agenda_item_id, list)
  }

  const offsets = [...firstAdvanceByItem.values()]
  const totalDuration =
    offsets.length > 0 && t0 ? Math.max(...offsets) + 300 : bm.scheduled_public_start && prod.start_datetime
      ? Math.max(0, Math.floor((new Date(prod.start_datetime).getTime() - t0) / 1000))
      : 0

  const recessCount = (events || []).filter(e => e.event_type === 'recess').length

  const agenda = items.map(it => {
    const offset = firstAdvanceByItem.get(it.id)
    return {
      id: it.id,
      section_number: it.section_number,
      section_title: it.section_title,
      item_number: it.item_number,
      title: it.title,
      type: it.type,
      action_requested: it.action_requested,
      started_at_offset_seconds: offset ?? null,
      started_at_human: offset != null ? formatOffsetSeconds(offset) : null,
      presenters: presByItem.get(it.id) || [],
      documents: docsByItem.get(it.id) || [],
    }
  })

  const presenterNames = new Set<string>()
  for (const p of allPres || []) presenterNames.add(p.name)

  return {
    meeting: {
      title: prod.title,
      date: prod.start_datetime,
      type: prod.request_type_label,
      location: prod.event_location || prod.filming_location,
      scheduled_public_start: bm.scheduled_public_start,
      broadcast_status: bm.broadcast_status,
      youtube_url: prod.livestream_url,
      production_number: prod.production_number,
      cancelled: bm.broadcast_status === 'cancelled' || prod.status === 'Cancelled',
    },
    agenda,
    summary: {
      total_duration_seconds: totalDuration,
      action_items_count: items.filter(i => i.type === 'action').length,
      presenters_count: presenterNames.size,
      recess_count: recessCount,
    },
    not_board_meeting: false,
  }
}
