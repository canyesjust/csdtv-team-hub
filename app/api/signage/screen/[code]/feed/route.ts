import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { signageMediaPublicUrl } from '@/lib/signage/constants'
import { isInDateRange, signageTargetMatches, todayDateString } from '@/lib/signage/targeting'
import { fetchSignageWeather } from '@/lib/signage/weather'
import { loadScheduleTickerItems, mergeTickerItems, type TickerItem } from '@/lib/signage/ticker'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  const service = getServiceSupabaseClient()
  if (!service) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { data: screen, error: screenErr } = await service
    .from('signage_screens')
    .select('id, code, name, orientation, layout, wayfinding_heading, accepts_takeover, area_id, building, floor, active, signage_areas(id, name, slug, building, floor)')
    .eq('code', code)
    .maybeSingle()

  if (screenErr || !screen || !screen.active) {
    return NextResponse.json({ error: 'Screen not found' }, { status: 404 })
  }

  const today = todayDateString()
  const rawArea = screen.signage_areas as { id: string; name: string; slug: string; building: string | null; floor: number | null } | { id: string; name: string; slug: string; building: string | null; floor: number | null }[] | null
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

  const scheduleItems = await loadScheduleTickerItems(service, today)
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

  if (settingsRes.data?.ticker_extra?.trim()) {
    tickerItems.push({ text: settingsRes.data.ticker_extra.trim(), priority: 0 })
  }

  const ticker = mergeTickerItems(tickerItems)

  const wayfinding = (wayfindingRes.data ?? []).map(w => ({
    id: w.id,
    destination: w.destination,
    direction: w.direction,
  }))

  let live: { live: true; hls_url: string; label: string | null } | { live: false } = { live: false }
  const liveRow = liveRes.data
  if (
    liveRow?.is_live &&
    liveRow.hls_url &&
    screen.accepts_takeover &&
    signageTargetMatches(liveRow, target)
  ) {
    live = { live: true, hls_url: liveRow.hls_url, label: liveRow.label }
  }

  const settings = settingsRes.data
  const weather = await fetchSignageWeather(
    Number(settings?.weather_lat ?? 40.5649),
    Number(settings?.weather_lon ?? -111.8389),
  )

  return NextResponse.json(
    {
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
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
