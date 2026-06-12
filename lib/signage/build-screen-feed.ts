import type { SupabaseClient } from '@supabase/supabase-js'
import { announcementScopeLabel, normalizeSignageAnnouncementIcon } from './announcement-icons'
import { clampDisplaySeconds, sanitizeSignageHtml } from './content-display'
import { signageMediaPublicUrl, normalizeSignageTheme } from './constants'
import { signageLiveMatchesScreen } from './live-targeting'
import { normalizeSignageStreamUrl, youtubeEmbedUrlFromStreamUrl } from './stream-url'
import { isInDateRange, signageTargetMatches, todayDateString } from './targeting'
import { fetchSignageWeather, type SignageWeather } from './weather'
import { loadScheduleTickerItems, mergeTickerItems, type TickerItem } from './ticker'
import {
  normalizeSignageLayout,
  normalizeSignageOrientation,
  type ScreenFeed,
} from './screen-feed'

export type { ScreenFeed as ScreenFeedPayload }

const WEATHER_TIMEOUT_MS = 1800

const weatherFallback: SignageWeather = { tempF: null, condition: '', icon: '🌤' }

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
  const target = { id: screen.id, area_id: screen.area_id }
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
    service.from('signage_live').select('*').eq('id', 1).maybeSingle(),
    siteId
      ? service.from('signage_sites').select('*').eq('id', siteId).maybeSingle()
      : service.from('signage_settings').select('*').eq('id', 1).maybeSingle(),
    service.from('signage_board_takeover').select('*').eq('id', 1).maybeSingle(),
  ])

  const media = (contentRes.data ?? [])
    .filter(row => isInDateRange(row.start_date, row.end_date, today))
    .filter(row => signageTargetMatches(row, target))
    .sort((a, b) => b.priority - a.priority || String(b.created_at).localeCompare(String(a.created_at)))
    .map(row => {
      const type = row.type as 'image' | 'video' | 'html'
      return {
        id: row.id,
        type,
        title: row.title,
        url: type === 'html' || !row.media_path ? '' : signageMediaPublicUrl(row.media_path),
        html: type === 'html' && row.html_body
          ? sanitizeSignageHtml(String(row.html_body))
          : null,
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

  const [scheduleItems, weather] = await Promise.all([
    scheduleTickerSafe(service, today),
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
  let board_takeover: ScreenFeed['board_takeover'] = undefined
  const tk = takeoverRes.data
  if (tk?.active && screen.board_takeover_enabled) {
    const audio = !!screen.board_takeover_audio
    if (tk.mode === 'preroll' && tk.board_channel_number) {
      board_takeover = { mode: 'preroll', url: `/board/${tk.board_channel_number}/preroll`, audio, label: tk.label ?? null }
    } else if (tk.mode === 'live' && tk.youtube_url) {
      const embed = youtubeEmbedUrlFromStreamUrl(tk.youtube_url, { controls: false, captions: true, muted: !audio })
      if (embed) board_takeover = { mode: 'live', url: embed, audio, label: tk.label ?? null }
    }
  }

  return {
    feed: {
      screen: {
        name: screen.name,
        code: screen.code,
        orientation: normalizeSignageOrientation(screen.orientation),
        layout: normalizeSignageLayout(screen.layout),
        heading: screen.wayfinding_heading,
        area: area ? { name: area.name, slug: area.slug, building: area.building, floor: area.floor } : null,
        center_name: site?.center_name ?? 'Canyons Innovation Center',
        theme: normalizeSignageTheme(screen.theme ?? site?.default_theme),
        colors: site?.use_brand_colors && site?.bg_color
          ? { bg: site.bg_color, panel: site.panel_color ?? null, accent: site.accent_color ?? null }
          : null,
      },
      media,
      announcements,
      ticker,
      wayfinding,
      visitors,
      live,
      board_takeover,
      weather,
    },
  }
}
