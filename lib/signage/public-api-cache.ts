/** CDN cache for public signage API routes (Vercel edge). */
export const SIGNAGE_AREAS_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
} as const

export const SIGNAGE_CONFIG_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
} as const

/** Screen feed polls every 30s. s-maxage below the poll interval with a wide
 *  stale-while-revalidate window means each poll is served instantly from the
 *  edge and revalidated in the background, rather than blocking on a full rebuild. */
export const SIGNAGE_FEED_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60',
} as const

/** Baked-HTML takeover poll (every 5s) — a tiny edge cache dedupes many TVs
 * while keeping live/board switches near-instant. */
export const SIGNAGE_TAKEOVER_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=3, stale-while-revalidate=10',
} as const

/** Auth-gated task board — never CDN-cache; key may be in Authorization. */
export const SIGNAGE_TASKS_CACHE_HEADERS = {
  'Cache-Control': 'private, no-store',
} as const

export const SIGNAGE_ICAL_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=120',
} as const
