/**
 * Grouping for the shows list. Pure, so the bucket boundaries are testable
 * without a database or a browser.
 *
 * Dates are compared as America/Denver calendar days, never as timestamps. A
 * Friday game at 7pm must read as "today" all evening, and a UTC comparison
 * would flip it to tomorrow at 5pm during daylight time.
 */
export const GRAPHICS_TZ = 'America/Denver'

export function localDay(date: Date, timeZone = GRAPHICS_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

/** Days between two YYYY-MM-DD strings. Positive means `day` is in the future. */
export function daysFrom(today: string, day: string): number {
  const a = Date.parse(`${today}T00:00:00Z`)
  const b = Date.parse(`${day}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

export const GRAPHICS_BUCKETS = ['live', 'today', 'tomorrow', 'week', 'later', 'past', 'undated'] as const
export type ShowBucket = (typeof GRAPHICS_BUCKETS)[number]

export const BUCKET_LABELS: Record<ShowBucket, string> = {
  live: 'On air now',
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'This week',
  later: 'Later',
  past: 'Done',
  undated: 'No date yet',
}

export type GroupableShow = {
  state: string
  show_date: string | null
}

/**
 * A live show is at the top whatever its date says, because a show that ran
 * past midnight is still the show you are running.
 */
export function bucketFor(show: GroupableShow, today: string): ShowBucket {
  if (show.state === 'live') return 'live'
  if (!show.show_date) return 'undated'
  const delta = daysFrom(today, show.show_date)
  if (delta < 0) return 'past'
  if (delta === 0) return 'today'
  if (delta === 1) return 'tomorrow'
  if (delta <= 7) return 'week'
  return 'later'
}

/**
 * Groups in reading order, empty buckets dropped. Upcoming sorts soonest
 * first; past sorts most recent first, because that is the one you want to
 * export chapters from.
 */
export function groupShows<T extends GroupableShow>(
  shows: T[],
  today: string,
): { bucket: ShowBucket; label: string; shows: T[] }[] {
  const by = new Map<ShowBucket, T[]>()
  for (const show of shows) {
    const bucket = bucketFor(show, today)
    const list = by.get(bucket)
    if (list) list.push(show)
    else by.set(bucket, [show])
  }

  const sortKey = (s: T) => s.show_date || ''
  return GRAPHICS_BUCKETS
    .filter(b => (by.get(b)?.length ?? 0) > 0)
    .map(bucket => {
      const list = [...(by.get(bucket) as T[])]
      list.sort((a, b) =>
        bucket === 'past' ? sortKey(b).localeCompare(sortKey(a)) : sortKey(a).localeCompare(sortKey(b)))
      return { bucket, label: BUCKET_LABELS[bucket], shows: list }
    })
}
