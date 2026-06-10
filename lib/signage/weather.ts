const NWS_USER_AGENT = 'CSDtv Team Hub CIC Signage (csdtv@canyonsdistrict.org)'
const CACHE_MS = 10 * 60 * 1000

export type SignageWeather = {
  tempF: number | null
  condition: string
  icon: string
}

type CacheEntry = { at: number; lat: number; lon: number; data: SignageWeather }

let cache: CacheEntry | null = null

function weatherIconFromShortForecast(text: string): string {
  const t = text.toLowerCase()
  if (t.includes('thunder')) return '⛈'
  if (t.includes('snow') || t.includes('blizzard')) return '❄'
  if (t.includes('rain') || t.includes('shower') || t.includes('drizzle')) return '🌧'
  if (t.includes('fog') || t.includes('haze')) return '🌫'
  if (t.includes('wind')) return '💨'
  if (t.includes('cloud') || t.includes('overcast')) return '☁'
  if (t.includes('partly')) return '⛅'
  if (t.includes('sunny') || t.includes('clear')) return '☀'
  return '🌤'
}

export async function fetchSignageWeather(lat: number, lon: number): Promise<SignageWeather> {
  const now = Date.now()
  if (cache && cache.lat === lat && cache.lon === lon && now - cache.at < CACHE_MS) {
    return cache.data
  }

  const fallback: SignageWeather = { tempF: null, condition: 'Weather unavailable', icon: '🌤' }

  try {
    const pointsRes = await fetch(
      `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      { headers: { 'User-Agent': NWS_USER_AGENT, Accept: 'application/geo+json' }, next: { revalidate: 600 } },
    )
    if (!pointsRes.ok) return fallback
    const points = (await pointsRes.json()) as { properties?: { forecast?: string } }
    const forecastUrl = points.properties?.forecast
    if (!forecastUrl) return fallback

    const forecastRes = await fetch(forecastUrl, {
      headers: { 'User-Agent': NWS_USER_AGENT, Accept: 'application/geo+json' },
      next: { revalidate: 600 },
    })
    if (!forecastRes.ok) return fallback
    const forecast = (await forecastRes.json()) as {
      properties?: { periods?: Array<{ temperature: number; shortForecast: string }> }
    }
    const period = forecast.properties?.periods?.[0]
    if (!period) return fallback

    const data: SignageWeather = {
      tempF: period.temperature,
      condition: period.shortForecast,
      icon: weatherIconFromShortForecast(period.shortForecast),
    }
    cache = { at: now, lat, lon, data }
    return data
  } catch {
    return fallback
  }
}
