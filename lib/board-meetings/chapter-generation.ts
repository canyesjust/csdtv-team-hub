import type { SupabaseClient } from '@supabase/supabase-js'
import { formatOffsetSeconds } from '@/lib/board-meetings/time-format'

type ChapterEntry = { offsetSeconds: number; title: string; itemId: string }

const LIVE_EVENT_TYPES = ['meeting_went_live', 'go_live']
const ADVANCE_EVENT_TYPES = ['agenda_item_advanced', 'advance', 'jump_to']

export async function generateYouTubeChapters(
  service: SupabaseClient,
  productionId: string,
): Promise<{ chapters_text: string; line_count: number; warnings: string[] }> {
  const warnings: string[] = []

  const { data: bm } = await service.from('board_meetings').select('*').eq('production_id', productionId).maybeSingle()
  if (!bm) throw new Error('Board meeting not found')

  const { data: events } = await service
    .from('meeting_event_log')
    .select('event_type, event_data, occurred_at')
    .eq('board_meeting_id', bm.id)
    .order('occurred_at', { ascending: true })

  const liveEvent = (events || []).find(e => LIVE_EVENT_TYPES.includes(e.event_type))
  let t0: number
  if (liveEvent) {
    t0 = new Date(liveEvent.occurred_at).getTime()
  } else if (bm.scheduled_public_start) {
    t0 = new Date(bm.scheduled_public_start).getTime()
    warnings.push(
      'Generated chapters use scheduled start time because live-start event was not recorded.',
    )
  } else {
    throw new Error('No live start time available')
  }

  if (bm.broadcast_status === 'live') {
    warnings.push('Meeting is still live; chapters may be incomplete.')
  }

  const itemIds = new Set<string>()
  const raw: ChapterEntry[] = []

  for (const ev of events || []) {
    if (!ADVANCE_EVENT_TYPES.includes(ev.event_type)) continue
    const data = ev.event_data as { agenda_item_id?: string } | null
    const itemId = data?.agenda_item_id
    if (!itemId) continue
    const offsetSeconds = Math.floor((new Date(ev.occurred_at).getTime() - t0) / 1000)
    if (offsetSeconds < 0) continue
    raw.push({
      offsetSeconds,
      itemId,
      title: '',
    })
  }

  if (raw.length === 0) {
    return { chapters_text: '', line_count: 0, warnings: [...warnings, 'No agenda advances recorded.'] }
  }

  const ids = [...new Set(raw.map(r => r.itemId))]
  const { data: items } = await service
    .from('board_meeting_agenda_items')
    .select('id, title')
    .in('id', ids)

  const titleById = new Map((items || []).map(i => [i.id, i.title]))

  // De-duplicate consecutive same item within 10s; keep first
  const deduped: ChapterEntry[] = []
  for (const entry of raw) {
    const title = titleById.get(entry.itemId) || 'Agenda item'
    const prev = deduped[deduped.length - 1]
    if (prev && prev.itemId === entry.itemId && entry.offsetSeconds - prev.offsetSeconds < 10) {
      continue
    }
    deduped.push({ ...entry, title })
  }

  // Ensure 0:00 opening
  if (deduped[0].offsetSeconds > 0) {
    deduped.unshift({ offsetSeconds: 0, title: 'Welcome', itemId: '__welcome__' })
  } else {
    deduped[0].offsetSeconds = 0
    if (deduped[0].title === 'Agenda item') deduped[0].title = 'Welcome'
  }

  // Collapse chapters shorter than 10s into next
  const merged: ChapterEntry[] = []
  for (let i = 0; i < deduped.length; i++) {
    const cur = deduped[i]
    const next = deduped[i + 1]
    if (next && next.offsetSeconds - cur.offsetSeconds < 10) {
      continue
    }
    merged.push(cur)
  }

  const distinct = merged.filter((c, i, arr) => i === 0 || c.itemId !== arr[i - 1].itemId)

  if (distinct.length < 3) {
    return {
      chapters_text: '',
      line_count: 0,
      warnings: [...warnings, 'Not enough chapters to meet YouTube minimum (3 required).'],
    }
  }

  const lines = distinct.map(c => `${formatOffsetSeconds(c.offsetSeconds)} ${c.title}`)
  return {
    chapters_text: lines.join('\n'),
    line_count: lines.length,
    warnings,
  }
}
