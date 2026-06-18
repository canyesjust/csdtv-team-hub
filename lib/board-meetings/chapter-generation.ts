import type { SupabaseClient } from '@supabase/supabase-js'
import { formatOffsetSeconds } from '@/lib/board-meetings/time-format'

type ChapterEntry = { offsetSeconds: number; title: string; itemId: string }

export type MeetingEventRow = {
  event_type: string
  event_data: unknown
  occurred_at: string
}

const LIVE_EVENT_TYPES = ['meeting_went_live', 'go_live']
const ADVANCE_EVENT_TYPES = ['agenda_item_advanced', 'advance', 'jump_to']

function extractAdvanceItemId(eventData: unknown): string | null {
  const data = eventData as { agenda_item_id?: string } | null
  const itemId = data?.agenda_item_id
  return typeof itemId === 'string' && itemId.length > 0 ? itemId : null
}

function collectAdvanceChapters(events: MeetingEventRow[], t0Ms: number): ChapterEntry[] {
  const raw: ChapterEntry[] = []
  for (const ev of events) {
    if (!ADVANCE_EVENT_TYPES.includes(ev.event_type)) continue
    const itemId = extractAdvanceItemId(ev.event_data)
    if (!itemId) continue
    const offsetSeconds = Math.floor((new Date(ev.occurred_at).getTime() - t0Ms) / 1000)
    if (offsetSeconds < 0) continue
    raw.push({ offsetSeconds, itemId, title: '' })
  }
  return raw
}

function advanceEventTimes(events: MeetingEventRow[]): number[] {
  return events
    .filter(e => ADVANCE_EVENT_TYPES.includes(e.event_type) && extractAdvanceItemId(e.event_data))
    .map(e => new Date(e.occurred_at).getTime())
}

/** Resolve chapter t=0 from logged events and meeting metadata. */
export function resolveChapterT0Ms(
  events: MeetingEventRow[],
  opts: {
    streamStartedAt?: string | null
    liveStartedAt?: string | null
    elapsedStartedAt?: string | null
    scheduledPublicStart?: string | null
    productionStartDatetime?: string | null
  },
): { t0Ms: number; warnings: string[]; anchoredToStream: boolean } {
  const warnings: string[] = []

  // Highest priority: the actual stream start (video 0:00). The gavel and agenda
  // advances then land at their true offset into the video, and we add a
  // "Pre-meeting" chapter at 0:00 for the preroll.
  if (opts.streamStartedAt) {
    return { t0Ms: new Date(opts.streamStartedAt).getTime(), warnings, anchoredToStream: true }
  }

  const liveEvent = events.find(e => LIVE_EVENT_TYPES.includes(e.event_type))
  if (liveEvent) {
    warnings.push('No stream-start time recorded — chapters are measured from the gavel, so they may be early by your preroll length. Use "Stream started" next time.')
    return { t0Ms: new Date(liveEvent.occurred_at).getTime(), warnings, anchoredToStream: false }
  }

  if (opts.liveStartedAt) {
    warnings.push('Using stored live start time (go-live event was not recorded in the event log).')
    return { t0Ms: new Date(opts.liveStartedAt).getTime(), warnings, anchoredToStream: false }
  }

  const advanceMs = advanceEventTimes(events)
  if (advanceMs.length > 0) {
    warnings.push('Using first agenda advance as start time because go-live was not recorded.')
    return { t0Ms: Math.min(...advanceMs), warnings, anchoredToStream: false }
  }

  if (opts.elapsedStartedAt) {
    warnings.push('Using meeting elapsed clock as start time because go-live was not recorded.')
    return { t0Ms: new Date(opts.elapsedStartedAt).getTime(), warnings, anchoredToStream: false }
  }

  if (opts.scheduledPublicStart) {
    warnings.push(
      'Generated chapters use scheduled start time because live-start event was not recorded.',
    )
    return { t0Ms: new Date(opts.scheduledPublicStart).getTime(), warnings, anchoredToStream: false }
  }

  if (opts.productionStartDatetime) {
    warnings.push('Using production start time because live-start event was not recorded.')
    return { t0Ms: new Date(opts.productionStartDatetime).getTime(), warnings, anchoredToStream: false }
  }

  throw new Error('No live start time available')
}

export async function generateYouTubeChapters(
  service: SupabaseClient,
  productionId: string,
  opts: { nudgeSeconds?: number; welcomeOffsetSeconds?: number | null } = {},
): Promise<{ chapters_text: string; line_count: number; warnings: string[]; stream_anchored: boolean; nudge_seconds: number }> {
  const warnings: string[] = []
  const nudgeSeconds = Math.round(opts.nudgeSeconds ?? 0)
  // Post-meeting anchor: the operator watches the recording and enters the video
  // time when the "Welcome" / first agenda item appeared. We then place every
  // chapter relative to that, ignoring the imperfect go-live/stream timestamps.
  const welcomeMode = typeof opts.welcomeOffsetSeconds === 'number' && opts.welcomeOffsetSeconds >= 0
  const welcomeOffset = welcomeMode ? Math.round(opts.welcomeOffsetSeconds as number) : 0

  const { data: bm } = await service.from('board_meetings').select('*').eq('production_id', productionId).maybeSingle()
  if (!bm) throw new Error('Board meeting not found')

  const { data: prod } = await service
    .from('productions')
    .select('start_datetime')
    .eq('id', productionId)
    .maybeSingle()

  const productionStart = prod?.start_datetime ?? null

  const { data: bstate } = await service
    .from('meeting_broadcast_state')
    .select('elapsed_started_at')
    .eq('board_meeting_id', bm.id)
    .maybeSingle()

  const { data: events } = await service
    .from('meeting_event_log')
    .select('event_type, event_data, occurred_at')
    .eq('board_meeting_id', bm.id)
    .order('occurred_at', { ascending: true })

  const eventRows = (events || []) as MeetingEventRow[]

  const { t0Ms: t0Initial, warnings: t0Warnings, anchoredToStream } = resolveChapterT0Ms(eventRows, {
    streamStartedAt: bm.stream_started_at ?? null,
    liveStartedAt: bm.live_started_at ?? null,
    elapsedStartedAt: bstate?.elapsed_started_at ?? null,
    scheduledPublicStart: bm.scheduled_public_start,
    productionStartDatetime: productionStart,
  })
  let t0Ms = t0Initial
  warnings.push(...t0Warnings)

  if (bm.broadcast_status === 'live') {
    warnings.push('Meeting is still live; chapters may be incomplete.')
  }

  let raw = collectAdvanceChapters(eventRows, t0Ms)

  if (raw.length === 0 && advanceEventTimes(eventRows).length > 0) {
    const rebasedMs = Math.min(...advanceEventTimes(eventRows))
    if (rebasedMs !== t0Ms) {
      warnings.push(
        'Rebased chapter start to the first agenda advance because advances occurred before the scheduled start.',
      )
      t0Ms = rebasedMs
      raw = collectAdvanceChapters(eventRows, t0Ms)
    }
  }

  if (raw.length === 0) {
    return { chapters_text: '', line_count: 0, warnings: [...warnings, 'No agenda advances recorded.'], stream_anchored: anchoredToStream, nudge_seconds: nudgeSeconds }
  }

  const ids = [...new Set(raw.map(r => r.itemId))]
  const { data: items } = await service
    .from('board_meeting_agenda_items')
    .select('id, title')
    .in('id', ids)

  const titleById = new Map((items || []).map(i => [i.id, i.title]))

  const deduped: ChapterEntry[] = []
  for (const entry of raw) {
    const title = titleById.get(entry.itemId) || 'Agenda item'
    const prev = deduped[deduped.length - 1]
    if (prev && prev.itemId === entry.itemId && entry.offsetSeconds - prev.offsetSeconds < 10) {
      continue
    }
    deduped.push({ ...entry, title })
  }

  const zeroTitle = welcomeMode ? 'Welcome' : anchoredToStream ? 'Pre-meeting' : 'Welcome'
  if (deduped[0].offsetSeconds > 0) {
    deduped.unshift({ offsetSeconds: 0, title: zeroTitle, itemId: '__welcome__' })
  } else {
    deduped[0].offsetSeconds = 0
    if (deduped[0].title === 'Agenda item') deduped[0].title = zeroTitle
  }

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
      warnings: [...warnings, 'YouTube needs at least 3 chapters; only ' + distinct.length + ' found.'],
      stream_anchored: anchoredToStream,
      nudge_seconds: nudgeSeconds,
    }
  }

  if (welcomeMode) {
    // Anchor the whole list to where "Welcome" actually appears in the video.
    // The gaps between items (from the event log) stay intact; we just slide the
    // first content chapter to the entered time and add a 0:00 pre-meeting chapter.
    for (const c of distinct) c.offsetSeconds += welcomeOffset
    if (welcomeOffset >= 10) {
      distinct.unshift({ offsetSeconds: 0, title: 'Pre-meeting', itemId: '__pre__' })
    } else {
      distinct[0].offsetSeconds = 0
    }
  } else if (nudgeSeconds !== 0) {
    // Fine-alignment nudge: keep the first chapter pinned to 0:00 and preserve
    // YouTube's minimum 10s spacing after shifting.
    for (const c of distinct) c.offsetSeconds = Math.max(0, c.offsetSeconds + nudgeSeconds)
    distinct[0].offsetSeconds = 0
    for (let i = 1; i < distinct.length; i++) {
      if (distinct[i].offsetSeconds < distinct[i - 1].offsetSeconds + 10) {
        distinct[i].offsetSeconds = distinct[i - 1].offsetSeconds + 10
      }
    }
  }

  if (!welcomeMode && !anchoredToStream) {
    warnings.push('Tip: enter the time "Welcome" appears in the video (below) to line every chapter up exactly.')
  }

  const lines = distinct.map(c => `${formatOffsetSeconds(c.offsetSeconds)} ${c.title}`)
  return {
    chapters_text: lines.join('\n'),
    line_count: lines.length,
    warnings,
    stream_anchored: anchoredToStream,
    nudge_seconds: nudgeSeconds,
  }
}
