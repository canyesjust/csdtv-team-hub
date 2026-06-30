const NWS_USER_AGENT = 'CSDtv Team Hub CIC Signage (csdtv@canyonsdistrict.org)'
const CACHE_MS = 10 * 60 * 1000

export type SignageWeather = {
  tempF: number | null
  condition: string
  icon: string
  high: number | null
  low: number | null
  windMph: number | null
}

type CacheEntry = { at: number; lat: number; lon: number; data: SignageWeather }

let cache: CacheEntry | null = null

const NWS_HEADERS = {
  'User-Agent': NWS_USER_AGENT,
  Accept: 'application/geo+json',
}

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

function celsiusToFahrenheit(c: number): number {
  return Math.round(c * (9 / 5) + 32)
}

type HourlyPeriod = {
  startTime: string
  endTime: string
  temperature: number
  shortForecast: string
}

function pickCurrentHourlyPeriod(periods: HourlyPeriod[], nowMs: number): HourlyPeriod | null {
  for (const period of periods) {
    const start = Date.parse(period.startTime)
    const end = Date.parse(period.endTime)
    if (Number.isFinite(start) && Number.isFinite(end) && nowMs >= start && nowMs < end) {
      return period
    }
  }
  return periods[0] ?? null
}

async function nwsJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: NWS_HEADERS, cache: 'no-store' })
  if (!res.ok) return null
  return (await res.json()) as T
}

async function fetchNearestObservation(stationsUrl: string): Promise<SignageWeather | null> {
  const stations = await nwsJson<{
    features?: Array<{ properties?: { stationIdentifier?: string } }>
  }>(stationsUrl)
  const stationId = stations?.features?.[0]?.properties?.stationIdentifier
  if (!stationId) return null

  const obs = await nwsJson<{
    properties?: {
      timestamp?: string
      textDescription?: string
      temperature?: { value?: number | null }
    }
  }>(`https://api.weather.gov/stations/${stationId}/observations/latest`)

  const props = obs?.properties
  if (!props) return null

  const tempC = props.temperature?.value
  if (tempC == null || !Number.isFinite(tempC)) return null

  const condition = props.textDescription?.trim()
  if (!condition) return null

  return {
    tempF: celsiusToFahrenheit(tempC),
    condition,
    icon: weatherIconFromShortForecast(condition),
    high: null,
    low: null,
    windMph: null,
  }
}

function parseWindMph(s: string | undefined): number | null {
  const m = (s || '').match(/(\d+)/)
  return m ? Number(m[1]) : null
}

async function fetchDailyExtremes(forecastUrl: string): Promise<{ high: number | null; low: number | null; windMph: number | null }> {
  const fc = await nwsJson<{
    properties?: { periods?: Array<{ isDaytime: boolean; temperature: number; windSpeed: string }> }
  }>(forecastUrl)
  const periods = fc?.properties?.periods ?? []
  const day = periods.find(p => p.isDaytime)
  const night = periods.find(p => !p.isDaytime)
  return {
    high: day ? day.temperature : night ? night.temperature : null,
    low: night ? night.temperature : null,
    windMph: parseWindMph(day?.windSpeed ?? periods[0]?.windSpeed),
  }
}

async function fetchCurrentHourly(hourlyUrl: string, nowMs: number): Promise<SignageWeather | null> {
  const hourly = await nwsJson<{
    properties?: { periods?: HourlyPeriod[] }
  }>(hourlyUrl)
  const period = pickCurrentHourlyPeriod(hourly?.properties?.periods ?? [], nowMs)
  if (!period) return null

  return {
    tempF: period.temperature,
    condition: period.shortForecast,
    icon: weatherIconFromShortForecast(period.shortForecast),
    high: null,
    low: null,
    windMph: null,
  }
}

export async function fetchSignageWeather(lat: number, lon: number): Promise<SignageWeather> {
  const now = Date.now()
  if (cache && cache.lat === lat && cache.lon === lon && now - cache.at < CACHE_MS) {
    return cache.data
  }

  const fallback: SignageWeather = { tempF: null, condition: 'Weather unavailable', icon: '🌤', high: null, low: null, windMph: null }

  try {
    const points = await nwsJson<{
      properties?: {
        forecast?: string
        forecastHourly?: string
        observationStations?: string
        timeZone?: string
      }
    }>(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`)
    if (!points?.properties) return fallback

    const { forecast, forecastHourly, observationStations } = points.properties
    const nowMs = Date.now()

    // Prefer live station reading; fall back to the current hourly period (not 12-hr "Tonight" low/high).
    let data: SignageWeather | null = null
    if (observationStations) {
      data = await fetchNearestObservation(observationStations)
    }
    if (!data && forecastHourly) {
      data = await fetchCurrentHourly(forecastHourly, nowMs)
    }
    if (!data) return fallback

    // Merge today's high/low + wind from the daily forecast.
    if (forecast) {
      try {
        const ext = await fetchDailyExtremes(forecast)
        data = { ...data, high: ext.high, low: ext.low, windMph: ext.windMph ?? data.windMph }
      } catch { /* keep base reading */ }
    }

    cache = { at: now, lat, lon, data }
    return data
  } catch {
    return fallback
  }
}
