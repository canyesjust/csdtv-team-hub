import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { parseIcsEvents, stableUuidFromString, type ParsedIcsEvent } from '@/lib/calendar-ics-parse'
import type { SupabaseClient } from '@supabase/supabase-js'

type FeedRow = {
  id: string
  school_id: string
  ics_url: string
  label: string
  last_etag: string | null
  last_modified_header: string | null
}

/**
 * Feeds labeled as an athletics/sports calendar (e.g. a school's dedicated
 * sports schedule, separate from its main feed) default new incoming events
 * to the "athletics" category instead of the "academics" default. Only
 * applies at insert time -- never overwrites a category a staff member set
 * by hand later.
 */
function defaultCategoryForFeed(label: string): 'athletics' | 'academics' {
  return /sport|athlet/i.test(label) ? 'athletics' : 'academics'
}

/** School year runs July 1 -- June 30. Many source ICS feeds are full
 * multi-year archives, so without a cutoff old events from prior school
 * years show up alongside current ones. Returns the [start, end) window for
 * whichever school year `now` falls in -- e.g. on any date from
 * 2026-07-01 through 2027-06-30 this returns July 1 2026 to July 1 2027.
 * Computed in UTC, so events right at the July 1 boundary can be off by a
 * few hours depending on the feed's timezone -- acceptable slop for a
 * year-scale cutoff. */
function getSchoolYearWindow(now: Date): { start: Date; end: Date } {
  const SCHOOL_YEAR_START_MONTH = 6 // July, 0-indexed
  const year = now.getUTCMonth() >= SCHOOL_YEAR_START_MONTH ? now.getUTCFullYear() : now.getUTCFullYear() - 1
  return {
    start: new Date(Date.UTC(year, SCHOOL_YEAR_START_MONTH, 1)),
    end: new Date(Date.UTC(year + 1, SCHOOL_YEAR_START_MONTH, 1)),
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** A real, fully-downloaded ICS file always opens with BEGIN:VCALENDAR and
 * closes with END:VCALENDAR as its last line. A connection that drops
 * mid-download, or a source that serves an HTML error/bot-challenge page
 * instead of the calendar, fails one or both of those -- which otherwise
 * looks identical to "an empty calendar" to the rest of the sync and
 * silently produces a hollow (or destructively incomplete) result. */
function looksLikeCompleteIcs(text: string): boolean {
  const trimmed = text.trim()
  return trimmed.includes('BEGIN:VCALENDAR') && trimmed.endsWith('END:VCALENDAR')
}

const FETCH_ATTEMPTS = 3
const RETRY_DELAY_MS = 1500

type FetchIcsResult =
  | { text: string; etag: string | null; lastModified: string | null }
  | { notModified: true; etag: string | null; lastModified: string | null }
  | { error: string }

/** Fetches a feed's ICS text, retrying a couple of times (with a short
 * pause) on a network error, a non-2xx response, or a response that
 * doesn't look like a complete calendar file -- a single transient hiccup
 * (dropped connection, a momentary block, a slow truncated read) shouldn't
 * be enough to mark a whole feed as failing or, worse, feed a partial
 * calendar into the diff against what's already synced.
 *
 * If the feed's last known ETag/Last-Modified are passed in, sends them as
 * If-None-Match / If-Modified-Since. A source that supports conditional
 * requests can then reply "304 Not Modified" instead of resending the whole
 * calendar -- lighter on the school's server, and a clean, explicit signal
 * that nothing changed rather than us re-parsing and re-diffing an
 * identical file every run. Most small school calendar tools don't support
 * this at all; when a source never sends an ETag/Last-Modified back, we
 * simply never have anything to send next time and every fetch behaves
 * exactly as a full fetch always has. */
async function fetchIcsWithRetry(
  url: string,
  conditional?: { etag: string | null; lastModified: string | null }
): Promise<FetchIcsResult> {
  let lastError = 'Fetch failed'
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const headers: Record<string, string> = { 'User-Agent': 'CSDtv-Calendar-Sync/1.0' }
      if (conditional?.etag) headers['If-None-Match'] = conditional.etag
      if (conditional?.lastModified) headers['If-Modified-Since'] = conditional.lastModified
      const res = await fetch(url, { headers, cache: 'no-store' })
      if (res.status === 304) {
        return { notModified: true, etag: res.headers.get('etag'), lastModified: res.headers.get('last-modified') }
      }
      if (!res.ok) {
        lastError = `Feed returned HTTP ${res.status}`
      } else {
        const text = await res.text()
        if (looksLikeCompleteIcs(text)) {
          return { text, etag: res.headers.get('etag'), lastModified: res.headers.get('last-modified') }
        }
        lastError = text.includes('BEGIN:VCALENDAR')
          ? "Response looked cut off partway through (no END:VCALENDAR at the end) -- the download may have been interrupted"
          : "Response wasn't a valid ICS calendar (no BEGIN:VCALENDAR) -- the source may be blocking automated requests or returned an error page instead of the calendar"
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'Fetch failed'
    }
    if (attempt < FETCH_ATTEMPTS) await sleep(RETRY_DELAY_MS)
  }
  return { error: `${lastError} (tried ${FETCH_ATTEMPTS} times)` }
}

type ExistingEventRow = {
  id: string
  source_uid: string | null
  status: string
  source_title: string | null
  source_start: string | null
  source_end: string | null
  source_location: string | null
  source_description: string | null
  source_sequence: number | null
  source_url: string | null
  source_categories: string | null
  source_class: string | null
  organizer_email: string | null
  busy_status: string | null
  is_all_day: boolean
}

export type CalendarSyncFeedResult = {
  feedId: string
  schoolId: string
  ok: boolean
  added: number
  updated: number
  removed: number
  unchanged: number
  /** True when the source replied "304 Not Modified" to a conditional
   * request -- the feed wasn't reprocessed at all this run because nothing
   * changed since the last fetch. */
  notModified?: boolean
  error?: string
}

export type CalendarSyncSummary = {
  ok: boolean
  feedsProcessed: number
  added: number
  updated: number
  removed: number
  failures: { feedId: string; schoolId: string; error?: string }[]
  results: CalendarSyncFeedResult[]
}

/** Run `items` through `worker` with at most `limit` in flight at once. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function runOne() {
    while (next < items.length) {
      const i = next++
      results[i] = await worker(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runOne))
  return results
}

async function syncFeed(service: SupabaseClient, feed: FeedRow): Promise<CalendarSyncFeedResult> {
  const result: CalendarSyncFeedResult = {
    feedId: feed.id, schoolId: feed.school_id, ok: false, added: 0, updated: 0, removed: 0, unchanged: 0,
  }
  const nowIso = new Date().toISOString()

  const fail = async (message: string) => {
    result.error = message
    await service.from('calendar_school_feeds').update({
      last_synced_at: nowIso, last_sync_ok: false, last_sync_error: message,
    }).eq('id', feed.id)
    return result
  }

  const fetchResult = await fetchIcsWithRetry(feed.ics_url, {
    etag: feed.last_etag, lastModified: feed.last_modified_header,
  })
  if ('error' in fetchResult) return fail(fetchResult.error)

  if ('notModified' in fetchResult) {
    // The source confirmed nothing changed since our last fetch -- skip
    // parsing and diffing entirely rather than reprocessing an identical
    // file. Nothing here counts as a "change" to the feed, so last_changed_at
    // (used for the staleness check) is deliberately left untouched.
    result.ok = true
    result.notModified = true
    await service.from('calendar_school_feeds').update({
      last_synced_at: nowIso, last_sync_ok: true, last_sync_error: null,
    }).eq('id', feed.id)
    return result
  }

  const icsText = fetchResult.text

  let parsed: ParsedIcsEvent[]
  try {
    parsed = parseIcsEvents(icsText)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Parse failed')
  }

  // This parser tracks recurring events the way most school calendar tools
  // actually publish them: one full VEVENT per occurrence, sharing a UID
  // (see recurrenceGroupId above). It does NOT expand an RRULE -- a single
  // VEVENT that says "every Tuesday until June" instead of listing each
  // Tuesday out. If a feed ever starts using that style, only its first
  // occurrence would come through, and nothing about that failure mode looks
  // any different from a normal sync (no error, no zero-event red flag --
  // just quietly incomplete, the same way Albion Middle's feed was). Counting
  // RRULE-bearing VEVENTs here, across the whole feed rather than just the
  // events that survive the school-year filter, means we always know which
  // feeds would need real expansion before it becomes a support mystery.
  const rruleEventCount = parsed.filter(ev => ev.rrule).length

  // Synthetic no-uid keys aren't stable across syncs, so events without a real
  // UID can't be tracked for updates/removal -- skip them rather than risk
  // creating a fresh duplicate row every sync. Also drop anything outside the
  // current school year (July 1 -- June 30) -- source feeds are often full
  // multi-year archives. Events that fall out of the window (including ones
  // synced in a prior school year, once the window rolls forward) are picked
  // up by the "gone from source" cleanup below and marked removed.
  const schoolYear = getSchoolYearWindow(new Date())
  const byUid = new Map<string, ParsedIcsEvent>()
  for (const ev of parsed) {
    if (ev.uid.startsWith('no-uid-')) continue
    if (ev.start < schoolYear.start || ev.start >= schoolYear.end) continue
    byUid.set(ev.uid, ev)
  }

  const { data: existingRows, error: existingError } = await service
    .from('calendar_school_events')
    .select(`
      id, source_uid, status, source_title, source_start, source_end, source_location, source_description,
      source_sequence, source_url, source_categories, source_class, organizer_email, busy_status, is_all_day
    `)
    .eq('feed_id', feed.id)

  if (existingError) return fail(existingError.message)

  const existingByUid = new Map<string, ExistingEventRow>()
  for (const row of (existingRows || []) as ExistingEventRow[]) {
    if (row.source_uid) existingByUid.set(row.source_uid, row)
  }

  const newRows: Record<string, unknown>[] = []
  const updates: { id: string; patch: Record<string, unknown> }[] = []

  for (const [uid, ev] of byUid) {
    const existing = existingByUid.get(uid)
    const sourceTitle = ev.title
    const sourceStart = ev.start.toISOString()
    const sourceEnd = ev.end ? ev.end.toISOString() : null
    const sourceLocation = ev.location
    const sourceDescription = ev.description
    // Metadata captured alongside the display fields -- see
    // lib/calendar-ics-parse.ts's ParsedIcsEvent doc comment for what each
    // one is. Never staff-editable, always mirrors the source as-is.
    const metadata = {
      is_all_day: ev.isAllDay,
      organizer_name: ev.organizerName,
      organizer_email: ev.organizerEmail,
      busy_status: ev.busyStatus,
      source_sequence: ev.sequence,
      source_url: ev.url,
      rrule: ev.rrule,
      source_categories: ev.sourceCategories,
      source_class: ev.sourceClass,
      source_created_at: ev.createdAt ? ev.createdAt.toISOString() : null,
      source_modified_at: ev.lastModifiedAt ? ev.lastModifiedAt.toISOString() : null,
      raw_ics: ev.rawText,
    }

    if (!existing) {
      newRows.push({
        school_id: feed.school_id,
        feed_id: feed.id,
        source_uid: uid,
        origin: 'synced',
        category: defaultCategoryForFeed(feed.label),
        is_recurring: ev.isRecurring,
        recurrence_group_id: ev.isRecurring ? stableUuidFromString(`${feed.id}:${uid}`) : null,
        source_title: sourceTitle,
        source_start: sourceStart,
        source_end: sourceEnd,
        source_location: sourceLocation,
        source_description: sourceDescription,
        title: sourceTitle,
        start_time: sourceStart,
        end_time: sourceEnd,
        location: sourceLocation,
        description: sourceDescription,
        status: ev.cancelled ? 'removed' : 'needs_review',
        updated_at: nowIso,
        ...metadata,
      })
      continue
    }

    if (ev.cancelled) {
      if (existing.status !== 'removed') {
        updates.push({ id: existing.id, patch: { status: 'removed', updated_at: nowIso } })
      }
      continue
    }

    const changed =
      existing.source_title !== sourceTitle ||
      existing.source_start !== sourceStart ||
      existing.source_end !== sourceEnd ||
      existing.source_location !== sourceLocation ||
      existing.source_description !== sourceDescription ||
      existing.source_sequence !== metadata.source_sequence ||
      existing.source_url !== metadata.source_url ||
      existing.source_categories !== metadata.source_categories ||
      existing.source_class !== metadata.source_class ||
      existing.organizer_email !== metadata.organizer_email ||
      existing.busy_status !== metadata.busy_status ||
      existing.is_all_day !== metadata.is_all_day

    if (!changed) continue

    const patch: Record<string, unknown> = {
      source_title: sourceTitle,
      source_start: sourceStart,
      source_end: sourceEnd,
      source_location: sourceLocation,
      source_description: sourceDescription,
      updated_at: nowIso,
      ...metadata,
    }

    if (existing.status === 'visible') {
      // Already approved and public -- don't silently overwrite what staff
      // published. Flip to 'updated' so a human reviews the incoming change;
      // the display fields (title/start_time/etc) are left untouched. The
      // metadata mirrors above still refresh either way -- they're
      // reference data, not something staff approve/publish.
      patch.status = 'updated'
    } else {
      // Nothing has been reviewed yet (or it was hidden/removed and just came
      // back) -- safe to refresh the display fields directly along with the mirror.
      patch.title = sourceTitle
      patch.start_time = sourceStart
      patch.end_time = sourceEnd
      patch.location = sourceLocation
      patch.description = sourceDescription
      // 'removed' (vanished from the source, now back) is genuinely new
      // information -- worth a fresh look, so send it back to the queue.
      // 'hidden' is different: it's a staff decision (an explicit Reject, or
      // an Acknowledge of a past removal), and most source tools bump their
      // own edit counter (SEQUENCE) on nearly any save, even a trivial one --
      // that alone was enough to trip `changed` and silently undo a staff
      // rejection every time the feed resynced. The metadata mirror above
      // still refreshes either way, so a hidden row someone opens shows
      // current source data -- it just doesn't jump back into the queue on
      // its own. Bringing a hidden event back to review is the "Restore to
      // review" button on that row, not an automatic sync side effect.
      if (existing.status === 'removed') {
        patch.status = 'needs_review'
      }
    }

    updates.push({ id: existing.id, patch })
  }

  // Anything still in the DB for this feed that the fresh sync didn't see at all
  // (not even as STATUS:CANCELLED) has disappeared from the source calendar entirely.
  const seenUids = new Set(byUid.keys())
  const goneIds = (existingRows || [])
    .filter((row: ExistingEventRow) => row.source_uid && !seenUids.has(row.source_uid) && row.status !== 'removed')
    .map((row: ExistingEventRow) => row.id)

  // A single flaky or partial fetch (network hiccup, the source truncating
  // its response, a timeout mid-download) looks identical to "most of these
  // events disappeared" -- the diff has no way to tell "the source really
  // deleted these" from "we only got half the calendar this time." If a
  // sync would mark more than half of what was already tracked as removed,
  // that's far more likely a bad fetch than a real mass cancellation --
  // skip the removal step and fail the sync instead, so nothing gets
  // silently wiped and the next retry (with a hopefully-complete fetch)
  // fixes it.
  const previouslyActiveCount = (existingRows || []).filter((row: ExistingEventRow) => row.status !== 'removed').length
  const suspiciousMassRemoval = goneIds.length >= 5 && previouslyActiveCount > 0 && goneIds.length / previouslyActiveCount > 0.5

  if (newRows.length > 0) {
    // Upsert instead of a plain insert: if two syncs for this feed overlap
    // (e.g. a cron run and a manual "Sync now" landing seconds apart), both
    // can read the same "this uid doesn't exist yet" snapshot and both try
    // to insert it. A plain insert makes the whole batch fail on that one
    // collision -- including every other genuinely new event in the same
    // batch -- and the feed shows as failing even though nothing was
    // actually wrong with the source calendar. ignoreDuplicates just skips
    // the row that's already there instead of erroring the batch.
    const { data: insertedRows, error: insertError } = await service
      .from('calendar_school_events')
      .upsert(newRows, { onConflict: 'feed_id,source_uid', ignoreDuplicates: true })
      .select('id')
    if (insertError) result.error = insertError.message
    else result.added = (insertedRows || []).length
  }

  if (updates.length > 0) {
    const updateResults = await mapWithConcurrency(updates, 8, async u => {
      const { error } = await service.from('calendar_school_events').update(u.patch).eq('id', u.id)
      return { error }
    })
    const failed = updateResults.filter(r => r.error)
    if (failed.length > 0 && !result.error) result.error = failed[0].error!.message
    result.updated = updates.length - failed.length
  }

  if (suspiciousMassRemoval) {
    if (!result.error) {
      result.error = `This sync would have marked ${goneIds.length} of ${previouslyActiveCount} previously tracked events as removed -- skipped that step since it usually means the feed returned incomplete data rather than that many events actually disappearing. Retry the sync; if this keeps happening, double-check the feed URL.`
    }
  } else if (goneIds.length > 0) {
    const { error: removeError } = await service
      .from('calendar_school_events')
      .update({ status: 'removed', updated_at: nowIso })
      .in('id', goneIds)
    if (removeError && !result.error) result.error = removeError.message
    else result.removed = goneIds.length
  }

  result.unchanged = byUid.size - newRows.length - updates.length
  result.ok = !result.error

  // last_changed_at only moves when something real actually changed --
  // added, updated, or removed. A run that's all "unchanged" (or that had to
  // skip the removal step) leaves it alone. This is what the Feeds page uses
  // to flag a feed that's reporting success but has gone quiet: the same
  // failure mode that hid the Albion Middle problem, where "sync OK" and
  // "sync OK and actually finding anything" looked identical.
  const hadRealChange = result.added > 0 || result.updated > 0 || result.removed > 0

  await service.from('calendar_school_feeds').update({
    last_synced_at: nowIso,
    last_sync_ok: result.ok,
    last_sync_error: result.error || null,
    rrule_event_count: rruleEventCount,
    last_etag: fetchResult.etag,
    last_modified_header: fetchResult.lastModified,
    ...(hadRealChange ? { last_changed_at: nowIso } : {}),
  }).eq('id', feed.id)

  return result
}

/**
 * Pulls every school's ICS feed (or a single feed, via `feedId`) and upserts
 * events into calendar_school_events as needs_review (new), updated (changed,
 * previously approved), or removed (disappeared from the source). Never
 * auto-publishes -- everything lands in the staff review queue at
 * /dashboard/calendar/review. Shared by the CRON_SECRET-gated scheduled route
 * (app/api/cron/calendar-sync) and the staff-auth-gated manual trigger
 * (app/api/calendar/sync-now).
 */
export async function runCalendarSync(options?: { feedId?: string }): Promise<CalendarSyncSummary | { error: string }> {
  const service = getServiceSupabaseClient()
  if (!service) return { error: 'Server configuration error' }

  let query = service.from('calendar_school_feeds').select('id, school_id, ics_url, label, last_etag, last_modified_header')
  if (options?.feedId) query = query.eq('id', options.feedId)
  const { data: feeds, error: feedsError } = await query

  if (feedsError) return { error: feedsError.message }

  const results = await mapWithConcurrency((feeds || []) as FeedRow[], 6, feed => syncFeed(service, feed))

  return {
    ok: true,
    feedsProcessed: results.length,
    added: results.reduce((n, r) => n + r.added, 0),
    updated: results.reduce((n, r) => n + r.updated, 0),
    removed: results.reduce((n, r) => n + r.removed, 0),
    failures: results.filter(r => !r.ok).map(r => ({ feedId: r.feedId, schoolId: r.schoolId, error: r.error })),
    results,
  }
}
