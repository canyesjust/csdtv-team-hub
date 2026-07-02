import { NextRequest, NextResponse } from 'next/server'
import { requireSignageEditorApi } from '@/lib/signage/server-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Hit = { lat: number; lon: number; label: string }

type OpenMeteoResult = {
  latitude: number
  longitude: number
  name: string
  admin1?: string
  country_code?: string
}

type NominatimResult = {
  lat: string
  lon: string
  display_name: string
  address?: Record<string, string>
}

/**
 * Geocode a place OR a full street address to lat/lon for signage weather.
 *   GET /api/signage/geocode?q=9361 S 300 E Sandy UT  ->  { lat, lon, label }
 *
 * Primary: OpenStreetMap Nominatim (handles street addresses AND places, free,
 * no key — requires a descriptive User-Agent per their usage policy). Fallback:
 * Open-Meteo's geocoder for bare city names when Nominatim finds nothing.
 */
async function geocodeNominatim(q: string): Promise<Hit | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=1&countrycodes=us&addressdetails=1`
  const ctrl = new AbortController()
  const to = setTimeout(() => ctrl.abort(), 5000)
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'CSDtv-TeamHub-Signage/1.0 (https://www.csdtvstaff.org)', 'Accept-Language': 'en' },
    })
    if (!res.ok) return null
    const arr = (await res.json().catch(() => [])) as NominatimResult[]
    if (!Array.isArray(arr) || arr.length === 0) return null
    const r = arr[0]
    const lat = parseFloat(r.lat)
    const lon = parseFloat(r.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
    const a = r.address || {}
    const road = [a.house_number, a.road].filter(Boolean).join(' ')
    const city = a.city || a.town || a.village || a.hamlet || a.suburb
    const label = [road || undefined, city, a.state].filter(Boolean).join(', ') || r.display_name.split(',').slice(0, 3).join(', ').trim()
    return { lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)), label }
  } catch {
    return null
  } finally {
    clearTimeout(to)
  }
}

async function geocodeOpenMeteo(q: string): Promise<Hit | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=en&format=json`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json().catch(() => ({}))) as { results?: OpenMeteoResult[] }
    const results = data.results || []
    if (!results.length) return null
    const pick =
      results.find(r => r.country_code === 'US' && /utah/i.test(r.admin1 || '')) ||
      results.find(r => r.country_code === 'US') ||
      results[0]
    return {
      lat: Number(pick.latitude.toFixed(4)),
      lon: Number(pick.longitude.toFixed(4)),
      label: [pick.name, pick.admin1].filter(Boolean).join(', '),
    }
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error

  const q = new URL(request.url).searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'q required' }, { status: 400 })

  const hit = (await geocodeNominatim(q)) || (await geocodeOpenMeteo(q))
  if (!hit) return NextResponse.json({ error: 'No match found' }, { status: 404 })
  return NextResponse.json(hit)
}
