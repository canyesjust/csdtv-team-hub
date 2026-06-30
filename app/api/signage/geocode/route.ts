import { NextRequest, NextResponse } from 'next/server'
import { requireSignageEditorApi } from '@/lib/signage/server-auth'

export const dynamic = 'force-dynamic'

type GeocodeResult = {
  latitude: number
  longitude: number
  name: string
  admin1?: string
  country_code?: string
}

/**
 * Geocode a place name to lat/lon for signage weather. Uses Open-Meteo's free
 * geocoding API (no key). Biased toward Utah / the US so a bare city name like
 * "Sandy" resolves locally rather than to a same-named city elsewhere.
 *   GET /api/signage/geocode?q=Sandy  ->  { lat, lon, label }
 */
export async function GET(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error

  const q = new URL(request.url).searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'q required' }, { status: 400 })

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=en&format=json`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ error: 'Geocoding failed' }, { status: 502 })
    const data = await res.json().catch(() => ({})) as { results?: GeocodeResult[] }
    const results = data.results || []
    if (results.length === 0) return NextResponse.json({ error: 'No match found' }, { status: 404 })

    // Prefer a Utah result, then any US result, then the first match.
    const pick =
      results.find(r => r.country_code === 'US' && /utah/i.test(r.admin1 || '')) ||
      results.find(r => r.country_code === 'US') ||
      results[0]

    return NextResponse.json({
      lat: Number(pick.latitude.toFixed(4)),
      lon: Number(pick.longitude.toFixed(4)),
      label: [pick.name, pick.admin1].filter(Boolean).join(', '),
    })
  } catch {
    return NextResponse.json({ error: 'Geocoding failed' }, { status: 502 })
  }
}
