import type { SupabaseClient } from '@supabase/supabase-js'
import { announcementScopeLabel, normalizeSignageAnnouncementIcon } from './announcement-icons'
import { clampDisplaySeconds, sanitizeSignageHtml } from './content-display'
import { signageMediaPublicUrl, normalizeSignageTheme } from './constants'
import { signageLiveMatchesScreen } from './live-targeting'
import { normalizeSignageStreamUrl } from './stream-url'
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
    .select('id, code, name, orientation, layout, theme, wayfinding_heading, accepts_takeover, area_id, building, floor, active, signage_areas(id, name, slug, building, floor)')
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

  const [
    contentRes,
    annRes,
    wayfindingRes,
    visitorsRes,
    liveRes,
    settingsRes,
  ] = await Promise.all([
    service.from('signage_content').select('*').eq('status', 'approved'),
    service.from('signage_announcements').select('*').eq('active', true),
    screen.area_id
      ? service.from('signage_wayfinding').select('*').eq('area_id', screen.area_id).order('sort_order')
      : Promise.resolve({ data: [] as unknown[] }),
    service.from('signage_visitors').select('*').eq('active', true).eq('visit_date', today),
    service.from('signage_live').select('*').eq('id', 1).maybeSingle(),
    service.from('signage_settings').select('*').eq('id', 1).maybeSingle(),
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

  const { data: areaRows } = await service.from('signage_areas').select('id, name')
  const areaNameById = new Map((areaRows ?? []).map(a => [a.id, a.name]))
  const { data: screenRows } = await service.from('signage_screens').select('id, name')
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

  const settings = settingsRes.data
  const weatherLat = Number(settings?.weather_lat ?? 40.5649)
  const weatherLon = Number(settings?.weather_lon ?? -111.8389)

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

  if (settings?.ticker_extra?.trim()) {
    tickerItems.push({ text: settings.ticker_extra.trim(), priority: 0 })
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

  return {
    feed: {
      screen: {
        name: screen.name,
        code: screen.code,
        orientation: normalizeSignageOrientation(screen.orientation),
        layout: normalizeSignageLayout(screen.layout),
        heading: screen.wayfinding_heading,
        area: area ? { name: area.name, slug: area.slug, building: area.building, floor: area.floor } : null,
        center_name: settings?.center_name ?? 'Canyons Innovation Center',
        theme: normalizeSignageTheme(screen.theme ?? settings?.default_theme),
      },
      media,
      announcements,
      ticker,
      wayfinding,
      visitors,
      live,
      weather,
    },
  }
}
