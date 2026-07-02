import type { SupabaseClient } from '@supabase/supabase-js'
import { announcementScopeLabel, normalizeSignageAnnouncementIcon } from './announcement-icons'
import { clampDisplaySeconds, sanitizeSignageHtml } from './content-display'
import { signageMediaPublicUrl, normalizeSignageTheme } from './constants'
import { signageLiveMatchesScreen } from './live-targeting'
import { normalizeSignageStreamUrl } from './stream-url'
import { isInDateRange, signageTargetMatches, todayDateString } from './targeting'
import { buildBroadcastBoardHtml, type BroadcastBoardItem } from './broadcast-board'
import { fetchSignageWeather, type SignageWeather } from './weather'
import { loadScheduleTickerItems, mergeTickerItems, type TickerItem } from './ticker'
import {
  normalizeSignageOrientation,
  resolveScreenLayout,
  type ScreenFeed,
} from './screen-feed'

export type { ScreenFeed as ScreenFeedPayload }

const WEATHER_TIMEOUT_MS = 1800

const weatherFallback: SignageWeather = { tempF: null, condition: '', icon: '🌤', high: null, low: null, windMph: null }

async function weatherWithTimeout(lat: number, lon: number): Promise<SignageWeather> {
  try {
    return await Promise.race([
      fetchSignageWeather(lat, lon),
      new Promise<SignageWeather>(resolve => {
        setTimeout(() => resolve(weatherFallback), WEATHER_TIMEOUT_MS)
      }),
    ])
  } catch {
    return weatherFallback
  }
}

async function scheduleTickerSafe(service: SupabaseClient, today: string): Promise<TickerItem[]> {
  try {
    return await loadScheduleTickerItems(service, today)
  } catch {
    return []
  }
}

const DISTRICT_LOGO_URL = 'https://www.canyonsdistrict.org/wp-content/uploads/2022/05/CanyonsLogoWhiteLong.png'
const DISTRICT_NEWS_FEED = 'https://rss.app/feeds/hR9Of3ZD4b0Rw2Bg.xml'
type DistrictNewsItem = { title: string; image: string | null }
const DISTRICT_NEWS_FALLBACK: DistrictNewsItem[] = [
  { title: 'Canyons Names Patricia Larkin as New Director of Career and Technical Education', image: null },
  { title: 'Building the Future: Students Watch Trades Campus Take Shape at Canyons Innovation Center', image: null },
  { title: 'Board Appoints Union Middle’s Angi Holden as New Director of CSD Middle Schools', image: null },
  { title: 'Canyons Announces Administrative Appointments for 2026-2027', image: null },
  { title: 'Corner Canyon High Student Brings Home Historic Glass at International DECA Competition', image: null },
]
let districtNewsCache: { at: number; items: DistrictNewsItem[] } | null = null
const DISTRICT_NEWS_TTL_MS = 10 * 60 * 1000

function decodeNewsTitle(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#8217;|&#x2019;/gi, '’')
    .replace(/&#8216;|&#x2018;/gi, '‘')
    .replace(/&#8211;|&#x2013;/gi, '–')
    .replace(/&#8212;|&#x2014;/gi, '—')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** District news headlines for the Zoned 2 bottom rotator (cached ~10 min). */
async function loadDistrictNews(): Promise<DistrictNewsItem[]> {
  if (districtNewsCache && Date.now() - districtNewsCache.at < DISTRICT_NEWS_TTL_MS) {
    return districtNewsCache.items
  }
  try {
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 2500)
    const res = await fetch(DISTRICT_NEWS_FEED, { signal: ctrl.signal, cache: 'no-store' })
    clearTimeout(to)
    if (!res.ok) throw new Error('news ' + res.status)
    const xml = await res.text()
    const blocks = xml.split(/<item[\s>]/i).slice(1)
    const items: DistrictNewsItem[] = []
    const seen = new Set<string>()
    for (const block of blocks) {
      const m = block.match(/<title>([\s\S]*?)<\/title>/i)
      if (!m) continue
      const t = decodeNewsTitle(m[1])
      if (!t || seen.has(t)) continue
      seen.add(t)
      // Article thumbnail: prefer <media:content url> / <media:thumbnail url>,
      // fall back to the first <img src> inside the item (e.g. the description).
      let image: string | null = null
      const mc = block.match(/<media:(?:content|thumbnail)[^>]*\burl="([^"]+)"/i)
      if (mc) image = mc[1]
      if (!image) {
        const enc = block.match(/<enclosure[^>]*\burl="([^"]+)"[^>]*type="image/i)
        if (enc) image = enc[1]
      }
      if (!image) {
        const im = block.match(/<img[^>]*\bsrc="([^"]+)"/i)
        if (im) image = im[1]
      }
      items.push({ title: t, image })
      if (items.length >= 8) break
    }
    const out = items.length ? items : DISTRICT_NEWS_FALLBACK
    districtNewsCache = { at: Date.now(), items: out }
    return out
  } catch {
    return districtNewsCache?.items ?? DISTRICT_NEWS_FALLBACK
  }
}

// District closures (2026-27). Update yearly. Dates are local calendar dates.
type ClosureDef = { start: string; end?: string; label: string }
const DISTRICT_CLOSURES: ClosureDef[] = [
  { start: '2026-07-03', label: 'Summer Friday — closed' },
  { start: '2026-07-06', label: 'Independence Day — closed' },
  { start: '2026-07-10', label: 'Summer Friday — closed' },
  { start: '2026-07-17', label: 'Summer Friday — closed' },
  { start: '2026-07-24', label: 'Pioneer Day — closed' },
  { start: '2026-09-07', label: 'Labor Day — closed' },
  { start: '2026-10-15', label: 'District closed to public' },
  { start: '2026-10-16', label: 'Fall Recess — closed' },
  { start: '2026-11-25', label: 'District closed to public' },
  { start: '2026-11-26', end: '2026-11-27', label: 'Thanksgiving Recess — closed' },
  { start: '2026-12-21', end: '2026-12-23', label: 'District closed to public' },
  { start: '2026-12-24', end: '2026-12-25', label: 'Winter Recess — closed' },
  { start: '2026-12-28', end: '2026-12-31', label: 'Winter Recess — closed' },
  { start: '2027-01-01', label: 'New Year’s Day — closed' },
  { start: '2027-01-18', label: 'Martin Luther King Jr. Day — closed' },
  { start: '2027-02-15', label: 'Presidents’ Day — closed' },
  { start: '2027-04-07', label: 'District closed to public' },
  { start: '2027-04-08', end: '2027-04-09', label: 'Spring Recess — closed' },
  { start: '2027-05-31', label: 'Memorial Day — closed' },
  { start: '2027-06-11', label: 'Summer Friday — closed' },
  { start: '2027-06-18', label: 'Summer Friday — closed' },
  { start: '2027-06-21', label: 'Juneteenth — closed' },
  { start: '2027-06-25', label: 'Summer Friday — closed' },
]

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatClosureDate(start: string, end?: string): string {
  const withWd: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }
  const noWd: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const s = parseYmd(start)
  if (!end) return s.toLocaleDateString('en-US', withWd)
  const e = parseYmd(end)
  if (s.getMonth() === e.getMonth()) return `${s.toLocaleDateString('en-US', noWd)}–${e.getDate()}`
  return `${s.toLocaleDateString('en-US', noWd)} – ${e.toLocaleDateString('en-US', noWd)}`
}

function upcomingClosures(limit = 5): { date: string; label: string }[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const out: { date: string; label: string }[] = []
  for (const c of DISTRICT_CLOSURES) {
    const end = parseYmd(c.end ?? c.start)
    end.setHours(23, 59, 59, 999)
    if (end.getTime() < today.getTime()) continue
    out.push({ date: formatClosureDate(c.start, c.end), label: c.label })
    if (out.length >= limit) break
  }
  return out
}

// ── Broadcast board (system content) ───────────────────────────────────────
// The board is the same for every screen, so build it once and cache briefly.
// It's shown only where an editor targets a broadcast_board content row.
let broadcastBoardCache: { at: number; html: string | null } | null = null
const BROADCAST_BOARD_TTL_MS = 5 * 60 * 1000
const BROADCAST_IMG_MAX_BYTES = 500 * 1024

function broadcastCountdownLabel(target: Date, now: Date): string {
  const day = 24 * 60 * 60 * 1000
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.round((startOf(target) - startOf(now)) / day)
  if (diff <= 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return `In ${diff} days`
}

function broadcastWatchLabel(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') || 'csdtv.org' } catch { return 'csdtv.org' }
}

/** Fetch a thumbnail and inline it as a data URI (best-effort, offline-safe). */
async function inlineBroadcastImage(url: string | null | undefined): Promise<string | null> {
  const u = (url || '').trim()
  if (!u || !/^https?:\/\//i.test(u)) return null
  try {
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 2000)
    const res = await fetch(u, { signal: ctrl.signal })
    clearTimeout(to)
    if (!res.ok) return null
    const type = res.headers.get('content-type') || 'image/jpeg'
    if (!type.startsWith('image/')) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength > BROADCAST_IMG_MAX_BYTES) return null
    return `data:${type};base64,${Buffer.from(buf).toString('base64')}`
  } catch { return null }
}

async function getBroadcastBoardHtml(service: SupabaseClient): Promise<string | null> {
  if (broadcastBoardCache && Date.now() - broadcastBoardCache.at < BROADCAST_BOARD_TTL_MS) {
    return broadcastBoardCache.html
  }
  try {
    const now = new Date()
    const in30Iso = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: featured } = await service
      .from('productions')
      .select('id, title, request_type_label, start_datetime, thumbnail_url, livestream_url')
      .eq('feature_on_broadcast_board', true)
      .in('request_type_label', ['LiveStream Meeting', 'Board Meeting'])
      .gte('start_datetime', now.toISOString())
      .lte('start_datetime', in30Iso)
      .order('start_datetime', { ascending: true })
      .limit(8)

    const rows = (featured ?? []).filter(p => p.start_datetime)
    if (!rows.length) { broadcastBoardCache = { at: Date.now(), html: null }; return null }

    const QR = (await import('qrcode')).default
    const items: BroadcastBoardItem[] = []
    for (const p of rows) {
      const dt = new Date(p.start_datetime as string)
      const stream = ((p.livestream_url as string) || '').trim() || 'https://csdtv.org'
      let qrDataUri: string | null = null
      try { qrDataUri = await QR.toDataURL(stream, { margin: 1, width: 260, errorCorrectionLevel: 'M' }) } catch { qrDataUri = null }
      items.push({
        title: (p.title as string) || 'CSDtv Broadcast',
        typeLabel: p.request_type_label === 'Board Meeting' ? 'Board Meeting' : 'Livestream',
        dateLabel: dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Denver' }),
        timeLabel: dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' }),
        countdownLabel: broadcastCountdownLabel(dt, now),
        imageDataUri: await inlineBroadcastImage(p.thumbnail_url as string | null),
        qrDataUri,
        watchLabel: broadcastWatchLabel(stream),
      })
    }
    const todayLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Denver' })
    const html = buildBroadcastBoardHtml(items, todayLabel)
    broadcastBoardCache = { at: Date.now(), html }
    return html
  } catch {
    return broadcastBoardCache?.html ?? null
  }
}

export async function buildScreenFeed(
  service: SupabaseClient,
  code: string,
): Promise<{ feed: ScreenFeed } | { error: 'not_found' | 'server_error' }> {
  const { data: screen, error: screenErr } = await service
    .from('signage_screens')
    .select('id, code, name, orientation, layout, theme, site_id, wayfinding_heading, accepts_takeover, board_takeover_enabled, board_takeover_audio, area_id, building, floor, active, signage_areas(id, name, slug, building, floor)')
    .eq('code', code)
    .maybeSingle()

  if (screenErr || !screen || !screen.active) {
    return { error: 'not_found' }
  }

  const today = todayDateString()
  const rawArea = screen.signage_areas as
    | { id: string; name: string; slug: string; building: string | null; floor: number | null }
    | { id: string; name: string; slug: string; building: string | null; floor: number | null }[]
    | null
  const area = Array.isArray(rawArea) ? rawArea[0] ?? null : rawArea
  const target = { id: screen.id, area_id: screen.area_id, building: screen.building }
  const siteId = (screen.site_id as string | null) ?? null

  let contentQuery = service.from('signage_content').select('*').eq('status', 'approved')
  let annQuery = service.from('signage_announcements').select('*').eq('active', true)
  let visitorsQuery = service.from('signage_visitors').select('*').eq('active', true).eq('visit_date', today)
  if (siteId) {
    contentQuery = contentQuery.eq('site_id', siteId)
    annQuery = annQuery.eq('site_id', siteId)
    visitorsQuery = visitorsQuery.eq('site_id', siteId)
  }

  const [
    contentRes,
    annRes,
    wayfindingRes,
    visitorsRes,
    liveRes,
    siteRes,
    takeoverRes,
  ] = await Promise.all([
    contentQuery,
    annQuery,
    screen.area_id
      ? service.from('signage_wayfinding').select('*').eq('area_id', screen.area_id).order('sort_order')
      : Promise.resolve({ data: [] as unknown[] }),
    visitorsQuery,
    siteId
      ? service.from('signage_live').select('*').eq('site_id', siteId).maybeSingle()
      : service.from('signage_live').select('*').eq('id', 1).maybeSingle(),
    siteId
      ? service.from('signage_sites').select('*').eq('id', siteId).maybeSingle()
      : service.from('signage_settings').select('*').eq('id', 1).maybeSingle(),
    service.from('signage_board_takeover').select('*').eq('id', 1).maybeSingle(),
  ])

  const filteredContent = (contentRes.data ?? [])
    .filter(row => isInDateRange(row.start_date, row.end_date, today))
    .filter(row => signageTargetMatches(row, target))
    .sort((a, b) => b.priority - a.priority || String(b.created_at).localeCompare(String(a.created_at)))

  // System "stock" blocks (e.g. the broadcast board) are content rows rendered
  // dynamically by the feed, but scheduled + targeted exactly like normal
  // content — so they only appear on the screens an editor assigned them to.
  const needsBoard = filteredContent.some(row => row.system_kind === 'broadcast_board')
  const broadcastBoardHtml = needsBoard ? await getBroadcastBoardHtml(service) : null

  const media = filteredContent
    // Drop a board slide when there are no upcoming broadcasts (nothing to show).
    .filter(row => row.system_kind !== 'broadcast_board' || broadcastBoardHtml)
    .map(row => {
      const isBoard = row.system_kind === 'broadcast_board'
      const type = (isBoard ? 'html' : row.type) as 'image' | 'video' | 'html'
      return {
        id: row.id,
        type,
        title: row.title,
        url: isBoard || type === 'html' || !row.media_path ? '' : signageMediaPublicUrl(row.media_path),
        html: isBoard
          ? broadcastBoardHtml
          : (type === 'html' && row.html_body ? sanitizeSignageHtml(String(row.html_body)) : null),
        full_screen: row.full_screen,
        display_seconds: clampDisplaySeconds(row.display_seconds),
      }
    })

  let areaRowsQuery = service.from('signage_areas').select('id, name')
  let screenRowsQuery = service.from('signage_screens').select('id, name')
  if (siteId) {
    areaRowsQuery = areaRowsQuery.eq('site_id', siteId)
    screenRowsQuery = screenRowsQuery.eq('site_id', siteId)
  }
  const { data: areaRows } = await areaRowsQuery
  const areaNameById = new Map((areaRows ?? []).map(a => [a.id, a.name]))
  const { data: screenRows } = await screenRowsQuery
  const screenNameById = new Map((screenRows ?? []).map(sc => [sc.id, sc.name]))

  const announcements = (annRes.data ?? [])
    .filter(row => isInDateRange(row.start_date, row.end_date, today))
    .filter(row => signageTargetMatches(row, target))
    .sort((a, b) => b.priority - a.priority)
    .map(row => ({
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      in_ticker: row.in_ticker,
      icon: normalizeSignageAnnouncementIcon(row.icon),
      scope_label: announcementScopeLabel(row, areaNameById, screenNameById),
      all_screens: row.all_screens,
    }))

  const tickerItems: TickerItem[] = announcements
    .filter(a => a.in_ticker)
    .map(a => ({
      text: a.subtitle ? `${a.title} — ${a.subtitle}` : a.title,
      priority: 10,
    }))

  const site = siteRes.data
  const weatherLat = Number(site?.weather_lat ?? 40.5649)
  const weatherLon = Number(site?.weather_lon ?? -111.8389)

  // The district calendar only shows in the ticker for sites that opt in, so a
  // new school doesn't inherit district-wide events.
  const wantsCalendar = Boolean(site?.show_calendar_ticker)
  const [scheduleItems, weather] = await Promise.all([
    wantsCalendar ? scheduleTickerSafe(service, today) : Promise.resolve([] as TickerItem[]),
    weatherWithTimeout(weatherLat, weatherLon),
  ])

  tickerItems.push(...scheduleItems)

  const visitors = (visitorsRes.data ?? []).map(v => ({
    id: v.id,
    name: v.name,
    note: v.note,
  }))

  for (const v of visitors) {
    tickerItems.push({
      text: v.note ? `Welcome ${v.name} — ${v.note}` : `Welcome ${v.name}`,
      priority: 20,
    })
  }

  if (site?.ticker_extra?.trim()) {
    tickerItems.push({ text: site.ticker_extra.trim(), priority: 0 })
  }

  const ticker = mergeTickerItems(tickerItems)

  const wayfinding = (wayfindingRes.data ?? []).map(w => ({
    id: w.id,
    destination: w.destination,
    direction: w.direction,
  }))

  let live: ScreenFeed['live'] = { live: false }
  const liveRow = liveRes.data
  const streamUrl = normalizeSignageStreamUrl(liveRow?.hls_url)
  if (
    liveRow?.is_live &&
    streamUrl &&
    screen.accepts_takeover &&
    signageLiveMatchesScreen(liveRow, target)
  ) {
    live = { live: true, hls_url: streamUrl, label: liveRow.label }
  }

  // Board meeting takeover — only screens that opted in follow the board meeting.
  // Fail-safe: a takeover is only honored while its heartbeat is fresh. The
  // control surface pings the heartbeat while it's open; if the operator forgets
  // to turn the takeover off, the heartbeat goes stale and screens return to
  // normal on their own (instead of staying stuck on the pre-roll all day).
  const TAKEOVER_STALE_MS = 10 * 60 * 1000
  let board_takeover: ScreenFeed['board_takeover'] = undefined
  const tk = takeoverRes.data
  const takeoverFresh = !!tk?.heartbeat_at && (Date.now() - new Date(tk.heartbeat_at).getTime() < TAKEOVER_STALE_MS)
  if (tk?.active && takeoverFresh && screen.board_takeover_enabled) {
    const audio = !!screen.board_takeover_audio
    if (tk.mode === 'preroll' && tk.board_channel_number) {
      board_takeover = { mode: 'preroll', url: `/board/${tk.board_channel_number}/preroll`, audio, label: tk.label ?? null }
    } else if (tk.mode === 'live' && tk.youtube_url && tk.board_channel_number) {
      // Stream + live agenda sidebar (the page reads the YouTube URL from board state).
      board_takeover = { mode: 'live', url: `/board/${tk.board_channel_number}/stream?audio=${audio ? 1 : 0}`, audio, label: tk.label ?? null }
    }
  }

  // Zoned 2 extras — only fetched for screens using the district-branded layout.
  const resolvedLayout = resolveScreenLayout(screen.layout, site?.default_layout)
  let spotlight: NonNullable<ScreenFeed['spotlight']> = []
  let csdtv_live: ScreenFeed['csdtv_live'] = null
  let news: DistrictNewsItem[] = []
  let closures: { date: string; label: string }[] = []
  let board_next: ScreenFeed['board_next'] = null
  if (resolvedLayout === 'zoned2') {
    // CSDtv Spotlight — latest published, public videos (board-meeting recordings excluded).
    try {
      const spotRes = await service
        .from('videos')
        .select('id, title, video_type, youtube_thumbnail, thumbnail_url, youtube_views, youtube_duration, date_published, updated_at')
        .eq('status', 'Published')
        .eq('visibility', 'Public')
        .order('date_published', { ascending: false, nullsFirst: false })
        .limit(12)
      spotlight = (spotRes.data ?? [])
        .map((v: Record<string, unknown>) => ({
          id: String(v.id),
          title: (v.title as string) ?? '',
          thumb: ((v.youtube_thumbnail as string) || (v.thumbnail_url as string) || ''),
          kind: (v.video_type as string) ?? null,
          views: (v.youtube_views as number) ?? null,
          duration: (v.youtube_duration as string) ?? null,
        }))
        .filter(v => v.thumb && v.title && !/board meeting/i.test(v.title))
        .slice(0, 5)
    } catch {
      spotlight = []
    }

    // Next board meeting (upcoming).
    try {
      const bmRes = await service
        .from('board_meetings')
        .select('scheduled_public_start, productions(title)')
        .gte('scheduled_public_start', new Date().toISOString())
        .order('scheduled_public_start', { ascending: true })
        .limit(1)
        .maybeSingle()
      const start = bmRes.data?.scheduled_public_start as string | undefined
      if (start) {
        const dt = new Date(start)
        const prod = (bmRes.data as { productions?: { title?: string | null } | { title?: string | null }[] | null }).productions
        const title = (Array.isArray(prod) ? prod[0]?.title : prod?.title) ?? 'Board of Education Meeting'
        board_next = {
          date: dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Denver' }),
          time: dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' }),
          title,
        }
      }
    } catch {
      board_next = null
    }

    // Upcoming district closures from the calendar.
    closures = upcomingClosures(5)

    // Now on CSDtv — a board meeting currently broadcasting live.
    try {
      const liveRes = await service
        .from('board_meetings')
        .select('production_id, productions(title)')
        .eq('broadcast_status', 'live')
        .limit(1)
        .maybeSingle()
      if (liveRes.data) {
        const prod = (liveRes.data as { productions?: { title?: string | null } | { title?: string | null }[] | null }).productions
        const title = Array.isArray(prod) ? prod[0]?.title : prod?.title
        csdtv_live = { title: title ?? 'Board Meeting', channel: null }
      }
    } catch {
      csdtv_live = null
    }

    // District news headlines (district website RSS) for the bottom rotator.
    news = await loadDistrictNews()
  }

  return {
    feed: {
      screen: {
        name: screen.name,
        code: screen.code,
        orientation: normalizeSignageOrientation(screen.orientation),
        layout: resolvedLayout,
        heading: screen.wayfinding_heading,
        area: area ? { name: area.name, slug: area.slug, building: area.building, floor: area.floor } : null,
        center_name: site?.center_name ?? 'Canyons Innovation Center',
        theme: normalizeSignageTheme(screen.theme ?? site?.default_theme),
        colors: site?.use_brand_colors && site?.bg_color
          ? { bg: site.bg_color, panel: site.panel_color ?? null, accent: site.accent_color ?? null }
          : null,
        brand_title: site?.brand_title ?? null,
        brand_subtitle: site?.brand_subtitle ?? null,
        logo_url: resolvedLayout === 'zoned2' ? (site?.logo_url ?? DISTRICT_LOGO_URL) : (site?.logo_url ?? null),
      },
      template: {
        show_weather: site?.show_weather ?? true,
        show_clock: site?.show_clock ?? true,
        show_ticker: site?.show_ticker ?? true,
        show_visitor_welcome: site?.show_visitor_welcome ?? true,
      },
      media,
      announcements,
      ticker,
      wayfinding,
      visitors,
      live,
      board_takeover,
      weather,
      spotlight,
      csdtv_live,
      news,
      closures,
      board_next,
    },
  }
}
