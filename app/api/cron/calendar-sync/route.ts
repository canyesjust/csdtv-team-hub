import { NextResponse } from 'next/server'
import { verifyCronBearer } from '@/lib/server/cron-auth'
import { getServiceSupabaseClient } from '@/lib/server/supabase-service'
import { parseIcsEvents, stableUuidFromString, type ParsedIcsEvent } from '@/lib/calendar-ics-parse'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type FeedRow = { id: string; school_id: string; ics_url: string }

type ExistingEventRow = {
  id: string
  source_uid: string | null
  status: string
  source_title: string | null
  source_start: string | null
  source_end: string | null
  source_location: string | null
  source_description: string | null
}

type FeedResult = {
  feedId: string
  schoolId: string
  ok: boolean
  added: number
  updated: number
  removed: number
  unchanged: number
  error?: string
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

async function syncFeed(service: SupabaseClient, feed: FeedRow): Promise<FeedResult> {
  const result: FeedResult = {
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

  let icsText: string
  try {
    const res = await fetch(feed.ics_url, { headers: { 'User-Agent': 'CSDtv-Calendar-Sync/1.0' }, cache: 'no-store' })
    if (!res.ok) throw new Error(`Feed returned HTTP ${res.status}`)
    icsText = await res.text()
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Fetch failed')
  }

  let parsed: ParsedIcsEvent[]
  try {
    parsed = parseIcsEvents(icsText)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Parse failed')
  }

  // Synthetic no-uid keys aren't stable across syncs, so events without a real
  // UID can't be tracked for updates/removal -- skip them rather than risk
  // creating a fresh duplicate row every sync.
  const byUid = new Map<string, ParsedIcsEvent>()
  for (const ev of parsed) {
    if (!ev.uid.startsWith('no-uid-')) byUid.set(ev.uid, ev)
  }

  const { data: existingRows, error: existingError } = await service
    .from('calendar_school_events')
    .select('id, source_uid, status, source_title, source_start, source_end, source_location, source_description')
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

    if (!existing) {
      newRows.push({
        school_id: feed.school_id,
        feed_id: feed.id,
        source_uid: uid,
        origin: 'synced',
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
      existing.source_description !== sourceDescription

    if (!changed) continue

    const patch: Record<string, unknown> = {
      source_title: sourceTitle,
      source_start: sourceStart,
      source_end: sourceEnd,
      source_location: sourceLocation,
      source_description: sourceDescription,
      updated_at: nowIso,
    }

    if (existing.status === 'visible') {
      // Already approved and public -- don't silently overwrite what staff
      // published. Flip to 'updated' so a human reviews the incoming change;
      // the display fields (title/start_time/etc) are left untouched.
      patch.status = 'updated'
    } else {
      // Nothing has been reviewed yet (or it was hidden/removed and just came
      // back) -- safe to refresh the display fields directly along with the mirror.
      patch.title = sourceTitle
      patch.start_time = sourceStart
      patch.end_time = sourceEnd
      patch.location = sourceLocation
      patch.description = sourceDescription
      if (existing.status === 'removed' || existing.status === 'hidden') {
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

  if (newRows.length > 0) {
    const { error: insertError } = await service.from('calendar_school_events').insert(newRows)
    if (insertError) result.error = insertError.message
    else result.added = newRows.length
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

  if (goneIds.length > 0) {
    const { error: removeError } = await service
      .from('calendar_school_events')
      .update({ status: 'removed', updated_at: nowIso })
      .in('id', goneIds)
    if (removeError && !result.error) result.error = removeError.message
    else result.removed = goneIds.length
  }

  result.unchanged = byUid.size - newRows.length - updates.length
  result.ok = !result.error

  await service.from('calendar_school_feeds').update({
    last_synced_at: nowIso,
    last_sync_ok: result.ok,
    last_sync_error: result.error || null,
  }).eq('id', feed.id)

  return result
}

/**
 * Pulls every school's ICS feed, upserts events into calendar_school_events as
 * needs_review (new), updated (changed, previously approved), or removed
 * (disappeared from the source). Never auto-publishes -- everything lands in
 * the staff review queue at /dashboard/calendar/review.
 *
 * Auth: Authorization: Bearer <CRON_SECRET or SUPABASE_SERVICE_ROLE_KEY> (see
 * lib/server/cron-auth.ts). Intended caller: a Supabase scheduled Edge
 * Function (deployed via the dashboard, not this repo) on a pg_cron schedule,
 * mirroring the daily-staff-digest / weekly-backup cron pattern.
 */
export async function GET(request: Request) {
  if (!verifyCronBearer(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = getServiceSupabaseClient()
  if (!service) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { data: feeds, error: feedsError } = await service
    .from('calendar_school_feeds')
    .select('id, school_id, ics_url')

  if (feedsError) {
    return NextResponse.json({ error: feedsError.message }, { status: 500 })
  }

  const results = await mapWithConcurrency((feeds || []) as FeedRow[], 6, feed => syncFeed(service, feed))

  return NextResponse.json({
    ok: true,
    feedsProcessed: results.length,
    added: results.reduce((n, r) => n + r.added, 0),
    updated: results.reduce((n, r) => n + r.updated, 0),
    removed: results.reduce((n, r) => n + r.removed, 0),
    failures: results.filter(r => !r.ok).map(r => ({ feedId: r.feedId, schoolId: r.schoolId, error: r.error })),
    results,
  })
}

export async function POST(request: Request) {
  return GET(request)
}
