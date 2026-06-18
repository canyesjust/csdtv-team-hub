import type { SupabaseClient } from '@supabase/supabase-js'
import { buildArchivePayload } from '@/lib/board-meetings/archive-data'
import {
  resolveIcompassMeeting,
  resolveIcompassAgendaDocId,
} from '@/lib/board-meetings/icompass-agenda'

// Public, read-only payload that powers the district website's
// "Watch Board Meetings Live" page. Assembled entirely from data that is already
// public (meeting dates, the agenda, public YouTube links). No write access, no
// service keys leave the server, no internal-only fields.

const TZ = 'America/Denver'

export type WatchState = 'live' | 'today' | 'upcoming' | 'soon' | 'none'

type AgendaDoc = { title: string; url: string | null }
type AgendaPresenter = { name: string; title: string | null }
type AgendaSubitem = { item_number: string; title: string }

type AgendaItem = {
  id: string
  item_number: string | null
  title: string
  type: string | null
  consent: boolean
  subitems: AgendaSubitem[]
  presenters: AgendaPresenter[]
  documents: AgendaDoc[]
  status: 'completed' | 'current' | 'upcoming' | null
  offset_seconds: number | null
  offset_label: string | null
  jump_url: string | null
}

type AgendaSection = {
  number: number
  title: string
  start_time: string | null
  items: AgendaItem[]
  // Lifted to the section when the section is a consent block (one consent motion).
  consent?: boolean
  subitems?: AgendaSubitem[]
  status?: 'completed' | 'current' | 'upcoming' | null
  offset_seconds?: number | null
  offset_label?: string | null
}

export type BoardWatchPayload = {
  generated_at: string
  now: string
  state: WatchState
  featured: {
    title: string
    date: string
    date_long: string
    scheduled_start: string | null
    scheduled_start_label: string | null
    location: string | null
    broadcast_status: string
    is_live: boolean
    days_until: number | null
    youtube_id: string | null
    youtube_url: string | null
    production_number: number
  } | null
  agenda: {
    available: boolean
    current_item_id: string | null
    diligent_url: string | null
    expected_label: string | null
    sections: AgendaSection[]
  }
  upcoming: {
    title: string
    date: string
    date_long: string
    date_short: string
  }[]
  recent: {
    title: string
    date: string
    date_short: string
    production_number: number
    youtube_id: string | null
    youtube_url: string | null
    thumbnail: string | null
  }[]
  links: {
    channel: string
    schedule: string
    public_participation: string
    diligent: string
  }
}

const LINKS = {
  channel: 'https://www.youtube.com/@canyonsdistricttv',
  schedule: 'https://www.canyonsdistrict.org/leadership/board/board-meetings/?sid=1',
  public_participation: 'https://www.canyonsdistrict.org/leadership/board/board-meetings/public-participation/',
  diligent: 'https://canyonsdistrict.community.highbond.com/portal/',
}

// ---------- date helpers (America/Denver, date-only) ----------

function denverDate(d: Date): string {
  // YYYY-MM-DD in America/Denver
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
function denverLong(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(d)
}
function denverShort(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' }).format(d)
}
function denverTimeLabel(iso: string | null): string | null {
  if (!iso) return null
  const s = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso))
  return s.replace(/\s*AM$/, ' a.m.').replace(/\s*PM$/, ' p.m.')
}
function wholeDaysBetween(fromStr: string, toStr: string): number {
  const a = Date.parse(`${fromStr}T00:00:00Z`)
  const b = Date.parse(`${toStr}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}
function saturdayBeforeLabel(meetingDateStr: string): string {
  const base = Date.parse(`${meetingDateStr}T00:00:00Z`)
  const dow = new Date(base).getUTCDay() // 0 Sun .. 6 Sat
  const back = dow === 6 ? 7 : dow + 1
  const sat = new Date(base - back * 86_400_000)
  const label = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(sat)
  return `Agenda posts ${label}`
}

function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:v=|youtu\.be\/|\/live\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}
function youtubeUrlFrom(url: string | null | undefined, id: string | null): string | null {
  if (url) return url
  return id ? `https://www.youtube.com/watch?v=${id}` : null
}

// ---------- meeting list ----------

// The sandbox test meeting must never surface publicly. Identified by its real id
// and production number (from db/test_board_meeting_seed.sql), not a title match.
const SANDBOX_PRODUCTION_ID = '11111111-1111-4111-8111-111111111111'
const SANDBOX_PRODUCTION_NUMBER = 999999999

// Only expose meetings that have been APPROVED. A production sitting at
// "Idea/Request" (not yet approved) or "Abandoned" must never appear publicly.
// (A board-cancelled meeting keeps an approved prod.status — cancellation is
// tracked on board_meetings.broadcast_status — so it still passes here.)
const PUBLIC_APPROVED_STATUSES = new Set([
  'Approved/Scheduled',
  'In Progress',
  'Complete Requested',
  'Complete',
])

type MeetingRow = {
  bmId: string | null
  productionId: string
  productionNumber: number
  title: string
  startDatetime: string
  localDate: string
  location: string | null
  livestreamUrl: string | null
  broadcastStatus: string
  scheduledStart: string | null
  icompassMeetingId: string | null
  agendaLocked: boolean
  cancelled: boolean
}

/**
 * The board-meeting universe = the same set the hub's Board Meetings tab shows:
 * `productions` where request_type_number = 4. `board_meetings` is OPTIONAL
 * enrichment (it only exists once a meeting is set up), never a filter — so
 * "not started" future meetings are included. Sandbox is excluded by id/number.
 */
async function loadBoardMeetings(service: SupabaseClient): Promise<MeetingRow[]> {
  const [{ data: prods }, { data: bms }] = await Promise.all([
    service
      .from('productions')
      .select('id, production_number, title, start_datetime, event_date, event_location, filming_location, livestream_url, status')
      .eq('request_type_number', 4),
    service
      .from('board_meetings')
      .select('id, production_id, broadcast_status, scheduled_public_start, icompass_meeting_id, agenda_locked'),
  ])
  if (!prods?.length) return []

  const bmByProd = new Map((bms || []).map(b => [b.production_id, b]))

  const rows: MeetingRow[] = []
  for (const p of prods) {
    if (p.id === SANDBOX_PRODUCTION_ID || p.production_number === SANDBOX_PRODUCTION_NUMBER) continue
    // Public = approved meetings only (never expose Idea/Request or Abandoned).
    if (!PUBLIC_APPROVED_STATUSES.has(((p.status as string | null) || '').trim())) continue
    // Match the hub's date logic: start_datetime, else event_date.
    const dateIso = (p.start_datetime as string | null) ?? (p.event_date as string | null) ?? null
    if (!dateIso) continue // no date — can't place on the public timeline
    const b = bmByProd.get(p.id) || null
    rows.push({
      bmId: b?.id ?? null,
      productionId: p.id,
      productionNumber: p.production_number,
      title: p.title,
      startDatetime: dateIso,
      localDate: denverDate(new Date(dateIso)),
      location: p.event_location || p.filming_location || null,
      livestreamUrl: p.livestream_url ?? null,
      broadcastStatus: (b?.broadcast_status as string) || 'none',
      scheduledStart: (b?.scheduled_public_start as string | null) ?? null,
      icompassMeetingId: (b?.icompass_meeting_id as string | null) ?? null,
      agendaLocked: !!b?.agenda_locked,
      cancelled: b?.broadcast_status === 'cancelled' || p.status === 'Cancelled',
    })
  }
  return rows
}

// ---------- agenda assembly ----------

function groupSections(
  entries: { section: number; item: AgendaItem }[],
  meta: Map<number, { title: string; start_time: string | null }>,
): AgendaSection[] {
  const order: number[] = []
  const bySection = new Map<number, AgendaItem[]>()
  for (const { section, item } of entries) {
    if (!bySection.has(section)) {
      bySection.set(section, [])
      order.push(section)
    }
    bySection.get(section)!.push(item)
  }
  return order.map(n => {
    const items = bySection.get(n)!
    const section: AgendaSection = {
      number: n,
      title: meta.get(n)?.title ?? '',
      start_time: meta.get(n)?.start_time ?? null,
      items,
    }
    // If this section is a consent block (one consent motion), lift its details to
    // the section so the public page can render the "Consent Agenda" card directly.
    const consentItem = items.find(it => it.consent)
    if (consentItem) {
      section.consent = true
      section.subitems = consentItem.subitems
      section.status = consentItem.status
      section.offset_seconds = consentItem.offset_seconds
      section.offset_label = consentItem.offset_label
    }
    return section
  })
}

async function assembleAgenda(
  service: SupabaseClient,
  featured: MeetingRow,
  youtubeUrl: string | null,
): Promise<BoardWatchPayload['agenda']> {
  const archive = await buildArchivePayload(service, featured.productionNumber)
  const storedAgenda = (archive && !archive.not_board_meeting ? archive.agenda : []) as unknown as Array<{
    id: string
    section_number: number
    section_title: string
    item_number: string
    title: string
    type: string
    consent_block: string | null
    started_at_offset_seconds: number | null
    started_at_human: string | null
    presenters: { name: string; title: string | null }[]
    documents: { title: string; filename: string; source_url: string | null }[]
  }>

  const diligentUrl = featured.icompassMeetingId
    ? await diligentDocUrl(featured.icompassMeetingId)
    : null

  // (a) Locked, imported agenda — only goes public once the agenda is LOCKED in the
  // hub (an unlocked/draft agenda is still being edited).
  if (storedAgenda.length > 0 && featured.bmId && featured.agendaLocked) {
    const bmId = featured.bmId
    const [{ data: subRows }, { data: bstate }] = await Promise.all([
      service.from('board_meeting_agenda_items').select('id, subitems').eq('board_meeting_id', bmId),
      service.from('meeting_broadcast_state').select('current_agenda_item_id').eq('board_meeting_id', bmId).maybeSingle(),
    ])
    const subMap = new Map<string, AgendaSubitem[]>()
    for (const r of subRows || []) {
      const subs = Array.isArray(r.subitems) ? (r.subitems as AgendaSubitem[]) : []
      subMap.set(r.id as string, subs)
    }

    const isLive = featured.broadcastStatus === 'live'
    const isArchived = featured.broadcastStatus === 'archived'
    const currentId = isLive ? ((bstate?.current_agenda_item_id as string | null) ?? null) : null
    const currentIndex = currentId ? storedAgenda.findIndex(a => a.id === currentId) : -1

    const sectionMeta = new Map<number, { title: string; start_time: string | null }>()
    const entries = storedAgenda.map((a, i) => {
      if (!sectionMeta.has(a.section_number)) sectionMeta.set(a.section_number, { title: a.section_title, start_time: null })
      let status: AgendaItem['status'] = null
      if (isLive && currentIndex >= 0) status = i < currentIndex ? 'completed' : i === currentIndex ? 'current' : 'upcoming'
      else if (isArchived) status = 'completed'
      const offset = a.started_at_offset_seconds
      const showJump = offset != null && (status === 'completed' || status === 'current')
      const item: AgendaItem = {
        id: a.id,
        item_number: a.item_number,
        title: a.title,
        type: a.type,
        consent: !!a.consent_block,
        subitems: subMap.get(a.id) || [],
        presenters: a.presenters,
        documents: a.documents.map(d => ({ title: d.title, url: d.source_url })),
        status,
        offset_seconds: showJump ? offset : null,
        offset_label: showJump ? a.started_at_human : null,
        jump_url: showJump && youtubeUrl ? `${youtubeUrl}&t=${offset}` : null,
      }
      return { section: a.section_number, item }
    })

    return {
      available: true,
      current_item_id: currentId,
      diligent_url: diligentUrl,
      expected_label: null,
      sections: groupSections(entries, sectionMeta),
    }
  }

  // (b) No agenda imported into the hub yet → not available. We deliberately do
  // NOT live-fetch Diligent here: the public page only shows an agenda once it has
  // been posted/imported in the hub.
  return {
    available: false,
    current_item_id: null,
    diligent_url: diligentUrl,
    expected_label: saturdayBeforeLabel(featured.localDate),
    sections: [],
  }
}

async function diligentDocUrl(icompassMeetingId: string): Promise<string | null> {
  const resolved = resolveIcompassMeeting(icompassMeetingId)
  if (!resolved) return null
  try {
    const docId = await resolveIcompassAgendaDocId(resolved.baseUrl, resolved.meetingId)
    return docId != null ? `${resolved.baseUrl.replace(/\/+$/, '')}/document/${docId}` : null
  } catch {
    return null
  }
}

// ---------- main ----------

export async function buildBoardWatchPayload(service: SupabaseClient): Promise<BoardWatchPayload> {
  const nowIso = new Date().toISOString()
  const today = denverDate(new Date())
  const meetings = await loadBoardMeetings(service)

  let state: WatchState = 'none'
  let featured: MeetingRow | null = null

  const live = meetings.filter(m => m.broadcastStatus === 'live')
  if (live.length > 0) {
    state = 'live'
    // Prefer a live meeting actually dated TODAY; otherwise the most recently dated
    // one. This stops a meeting that was left in "live" (never properly ended) from
    // hijacking the public page — or, worse, overriding today's real meeting.
    featured = live.sort((a, b) => {
      const aToday = a.localDate === today ? 1 : 0
      const bToday = b.localDate === today ? 1 : 0
      if (aToday !== bToday) return bToday - aToday
      return b.startDatetime.localeCompare(a.startDatetime)
    })[0]
  } else {
    const upcoming = meetings
      .filter(m => m.localDate >= today)
      .sort((a, b) => a.localDate.localeCompare(b.localDate))
    if (upcoming.length > 0) {
      featured = upcoming[0]
      state = featured.localDate === today ? 'today' : 'upcoming'
    } else {
      const past = meetings
        .filter(m => m.localDate < today)
        .sort((a, b) => b.localDate.localeCompare(a.localDate))
      if (past.length > 0) {
        featured = past[0]
        state = 'soon'
      }
    }
  }

  // Recent list — past board meetings, newest first, excluding the featured one
  // when it's the most-recent-past ("soon" state).
  const recentRows = meetings
    .filter(m => m.localDate < today && !(state === 'soon' && featured && m.productionId === featured.productionId))
    .sort((a, b) => b.localDate.localeCompare(a.localDate))
    .slice(0, 6)

  const recentThumbs = new Map<string, string | null>()
  if (recentRows.length > 0) {
    const prodIds = recentRows.map(r => r.productionId)
    const { data: vids } = await service
      .from('videos')
      .select('production_id, youtube_thumbnail')
      .in('production_id', prodIds)
    for (const v of (vids as Array<{ production_id: string | null; youtube_thumbnail: string | null }> | null) || []) {
      if (v.production_id && !recentThumbs.has(v.production_id)) recentThumbs.set(v.production_id, v.youtube_thumbnail ?? null)
    }
  }

  const recent = recentRows.map(m => {
    const id = youtubeId(m.livestreamUrl)
    const thumb = recentThumbs.get(m.productionId) || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null)
    return {
      title: m.title,
      date: m.localDate,
      date_short: denverShort(new Date(m.startDatetime)),
      production_number: m.productionNumber,
      youtube_id: id,
      youtube_url: youtubeUrlFrom(m.livestreamUrl, id),
      thumbnail: thumb,
    }
  })

  // "Coming Up" — future board meetings other than the featured one.
  const upcoming = meetings
    .filter(m => m.localDate >= today && !(featured && m.productionId === featured.productionId))
    .sort((a, b) => a.localDate.localeCompare(b.localDate))
    .slice(0, 4)
    .map(m => ({
      title: m.title,
      date: m.localDate,
      date_long: denverLong(new Date(m.startDatetime)),
      date_short: denverShort(new Date(m.startDatetime)),
    }))

  let featuredOut: BoardWatchPayload['featured'] = null
  let agenda: BoardWatchPayload['agenda'] = {
    available: false,
    current_item_id: null,
    diligent_url: null,
    expected_label: null,
    sections: [],
  }

  if (featured) {
    const id = youtubeId(featured.livestreamUrl)
    const ytUrl = youtubeUrlFrom(featured.livestreamUrl, id)
    const daysUntil = state === 'today' || state === 'upcoming' ? Math.max(0, wholeDaysBetween(today, featured.localDate)) : null
    featuredOut = {
      title: featured.title,
      date: featured.localDate,
      date_long: denverLong(new Date(featured.startDatetime)),
      scheduled_start: featured.scheduledStart,
      scheduled_start_label: denverTimeLabel(featured.scheduledStart),
      location: featured.location,
      broadcast_status: featured.broadcastStatus,
      is_live: state === 'live',
      days_until: daysUntil,
      youtube_id: id,
      youtube_url: ytUrl,
      production_number: featured.productionNumber,
    }
    agenda = await assembleAgenda(service, featured, ytUrl)
  }

  return {
    generated_at: nowIso,
    now: nowIso,
    state,
    featured: featuredOut,
    agenda,
    upcoming,
    recent,
    links: LINKS,
  }
}
