import { NextRequest, NextResponse } from 'next/server'
import { requireManagerApi } from '@/lib/signage/server-auth'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest) {
  const auth = await requireManagerApi()
  if ('error' in auth) return auth.error
  const { service } = auth
  const body = await request.json()
  const { data, error } = await service.from('signage_settings').update({
    center_name: body.center_name,
    weather_lat: body.weather_lat,
    weather_lon: body.weather_lon,
    ticker_extra: body.ticker_extra,
  }).eq('id', 1).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ settings: data })
}
