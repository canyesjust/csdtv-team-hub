/** CDN cache for public signage API routes (Vercel edge). */
export const SIGNAGE_AREAS_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
} as const

export const SIGNAGE_CONFIG_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
} as const

/** Screen feed polls every 5s — short edge cache dedupes concurrent displays. */
export const SIGNAGE_FEED_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=4, stale-while-revalidate=10',
} as const

/** Baked-HTML takeover poll (every 5s) — a tiny edge cache dedupes many TVs
 * while keeping live/board switches near-instant. */
export const SIGNAGE_TAKEOVER_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=3, stale-while-revalidate=10',
} as const

/** Task board polls every 60s and is identical for every screen (keyed by ?k=) —
 * a 30s edge cache dedupes concurrent displays and cuts the ~7 DB queries per call. */
export const SIGNAGE_TASKS_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
} as const

export const SIGNAGE_ICAL_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=120',
} as const
