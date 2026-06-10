import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { fetchSignageWeather } from '@/lib/signage/weather'

export const dynamic = 'force-dynamic'

export async function GET() {
  const service = getServiceSupabaseClient()
  if (!service) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { data: settings } = await service.from('signage_settings').select('weather_lat, weather_lon').eq('id', 1).maybeSingle()
  const weather = await fetchSignageWeather(
    Number(settings?.weather_lat ?? 40.5649),
    Number(settings?.weather_lon ?? -111.8389),
  )

  return NextResponse.json(weather, {
    headers: { 'Cache-Control': 'public, max-age=600, stale-while-revalidate=300' },
  })
}
