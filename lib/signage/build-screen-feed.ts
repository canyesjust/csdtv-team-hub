import type { SupabaseClient } from '@supabase/supabase-js'
import { signageMediaPublicUrl } from './constants'
import { isInDateRange, signageTargetMatches, todayDateString } from './targeting'
import { fetchSignageWeather, type SignageWeather } from './weather'
import { loadScheduleTickerItems, mergeTickerItems, type TickerItem } from './ticker'

export type ScreenFeedPayload = {
  screen: {
    name: string
    code: string
    orientation: string
    layout: string
    heading: string | null
    area: { name: string; slug: string; building: string | null; floor: number | null } | null
    center_name: string
  }
  media: Array<{ id: string; type: 'image' | 'video'; title: string | null; url: string; full_screen: boolean }>
  announcements: Array<{ id: string; title: string; subtitle: string | null; in_ticker: boolean }>
  ticker: string[]
  wayfinding: Array<{ id: string; destination: string; direction: string }>
  visitors: Array<{ id: string; name: string; note: string | null }>
  live: { live: true; hls_url: string; label: string | null } | { live: false }
  weather: SignageWeather
}

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
): Promise<{ feed: ScreenFeedPayload } | { error: 'not_found' | 'server_error' }> {
  const { data: screen, error: screenErr } = await service
    .from('signage_screens')
    .select('id, code, name, orientation, layout, wayfinding_heading, accepts_takeover, area_id, building, floor, active, signage_areas(id, name, slug, building, floor)')
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
    screen.layout === 'wayfinding' && screen.area_id
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
    .map(row => ({
      id: row.id,
      type: row.type as 'image' | 'video',
      title: row.title,
      url: signageMediaPublicUrl(row.media_path),
      full_screen: row.full_screen,
    }))

  const announcements = (annRes.data ?? [])
    .filter(row => isInDateRange(row.start_date, row.end_date, today))
    .filter(row => signageTargetMatches(row, target))
    .sort((a, b) => b.priority - a.priority)
    .map(row => ({
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      in_ticker: row.in_ticker,
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

  let live: ScreenFeedPayload['live'] = { live: false }
  const liveRow = liveRes.data
  if (
    liveRow?.is_live &&
    liveRow.hls_url &&
    screen.accepts_takeover &&
    signageTargetMatches(liveRow, target)
  ) {
    live = { live: true, hls_url: liveRow.hls_url, label: liveRow.label }
  }

  return {
    feed: {
      screen: {
        name: screen.name,
        code: screen.code,
        orientation: screen.orientation,
        layout: screen.layout,
        heading: screen.wayfinding_heading,
        area: area ? { name: area.name, slug: area.slug, building: area.building, floor: area.floor } : null,
        center_name: settings?.center_name ?? 'Canyons Innovation Center',
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
