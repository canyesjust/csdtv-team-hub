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

export const SIGNAGE_ICAL_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=120',
} as const
