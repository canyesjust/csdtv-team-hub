'use client'

import { useEffect, useState, useCallback, useMemo, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase'
import { canManageCalendarQueue } from '@/lib/calendar-access'
import { toast } from '@/lib/toast'
import { confirmDialog } from '@/lib/confirm'
import { AsyncButton } from '../../components/AsyncButton'

type School = {
  id: string
  name: string
  short_name: string | null
  level: string | null
  type: string
  primary_color: string | null
}

type Feed = {
  id: string
  school_id: string
  label: string
  ics_url: string
  created_at: string
  last_synced_at: string | null
  last_sync_ok: boolean | null
  last_sync_error: string | null
  last_changed_at: string | null
  rrule_event_count: number
}

const FEED_SELECT = 'id, school_id, label, ics_url, created_at, last_synced_at, last_sync_ok, last_sync_error, last_changed_at, rrule_event_count'

/** A feed can report "sync OK" every single run while quietly finding
 * nothing new for weeks -- this is exactly what hid the Albion Middle
 * problem (a feed that "succeeded" while adding zero events after its URL
 * silently switched calendar tools). last_synced_at moves on every run;
 * last_changed_at only moves when a sync actually added, updated, or
 * removed something. A feed that's gone quiet on the second one for a long
 * stretch is worth a human glancing at, even though nothing is "failing." */
const STALE_DAYS = 21

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  return (Date.now() - new Date(iso).getTime()) / 86400000
}

function staleReason(feed: Feed): string | null {
  if (feed.last_sync_ok === false) return null // already called out as failing -- don't double-warn
  if (!feed.last_synced_at) return null // never synced yet
  if (feed.last_changed_at) {
    const days = daysSince(feed.last_changed_at)
    if (days !== null && days >= STALE_DAYS) {
      return `No new or changed events picked up in ${Math.floor(days)} days`
    }
    return null
  }
  // Never once recorded a change -- could just be a brand-new feed (fine),
  // or it could be quietly adding nothing since the day it was created,
  // exactly like Albion Middle was before anyone noticed by hand.
  const daysSinceCreated = daysSince(feed.created_at)
  if (daysSinceCreated !== null && daysSinceCreated >= STALE_DAYS) {
    return `Syncing OK but has never picked up a single event in ${Math.floor(daysSinceCreated)} days -- worth checking the feed URL`
  }
  return null
}

type FeedCounts = Record<string, number>

/** A single event the mass-removal guard is holding back -- see
 * lib/server/calendar-sync.ts's MassRemovalCandidate. Mirrored here rather
 * than imported since that module pulls in server-only Supabase code that
 * can't land in this client bundle. */
type MassRemovalCandidate = { id: string; title: string | null; start: string | null; location: string | null }

type FeedSyncResult = {
  feedId: string
  schoolId: string
  ok: boolean
  added: number
  updated: number
  removed: number
  error?: string
  massRemovalCandidates?: MassRemovalCandidate[]
  massRemovalTotal?: number
}

type SyncSummary = {
  ok: boolean
  feedsProcessed: number
  added: number
  updated: number
  removed: number
  failures: { feedId: string; schoolId: string; error?: string }[]
  results?: FeedSyncResult[]
}

const STATUS_LABELS: Record<string, string> = {
  visible: 'live',
  needs_review: 'in review',
  updated: 'changed',
  hidden: 'hidden',
}

function isSportsLabel(label: string): boolean {
  return /sport|athlet/i.test(label)
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never synced'
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

function fmtCandidateDate(iso: string | null): string {
  if (!iso) return 'No date'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

function activeCount(counts: FeedCounts | undefined): number {
  if (!counts) return 0
  return Object.entries(counts).filter(([status]) => status !== 'removed').reduce((sum, [, n]) => sum + n, 0)
}

// This is a cumulative snapshot -- everything currently tracked for the
// feed, across every sync ever run -- not what changed in the most recent
// sync. The "Sync complete" toast is the per-run delta; this is the total.
function countsSummary(counts: FeedCounts | undefined): string {
  if (!counts) return 'No events synced yet'
  const parts = Object.keys(STATUS_LABELS)
    .map(key => (counts[key] ? `${counts[key]} ${STATUS_LABELS[key]}` : null))
    .filter(Boolean) as string[]
  if (parts.length === 0) return counts.removed ? 'No active events from this feed right now' : 'No events synced yet'
  return `Total tracked: ${parts.join(' · ')}`
}

type SupabaseClient = ReturnType<typeof createClient>

// Supabase caps a single request at 1000 rows by default (PostgREST's
// db-max-rows setting) -- a plain .select() on this table silently comes
// back truncated once there are more rows than that, and since this query
// has no explicit order, WHICH ~1000 rows come back isn't even consistent
// between calls (this is why the "Events tracked" stat used to bounce
// around -- 907, then 864 after a resync -- with no real data change
// behind it). Page through with .range() and a stable .order('id') so the
// count reflects every row, every time.
async function fetchAllEventStatusRows(supabase: SupabaseClient): Promise<{ feed_id: string | null; status: string }[]> {
  const PAGE_SIZE = 1000
  const rows: { feed_id: string | null; status: string }[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('calendar_school_events')
      .select('feed_id, status')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...((data || []) as { feed_id: string | null; status: string }[]))
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return rows
}

async function callSyncNow(body?: { feedId: string; allowMassRemoval?: boolean }): Promise<SyncSummary> {
  const res = await fetch('/api/calendar/sync-now', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Sync failed')
  return data as SyncSummary
}

// This describes what changed in THIS sync run only (a delta), not the
// total number of events tracked for the feed -- see countsSummary for that.
function summaryToast(summary: SyncSummary) {
  const parts: string[] = []
  if (summary.added) parts.push(`${summary.added} new`)
  if (summary.updated) parts.push(`${summary.updated} changed`)
  if (summary.removed) parts.push(`${summary.removed} removed`)
  const body = parts.length ? `${parts.join(', ')} this run` : 'no changes this run'
  if (summary.failures.length > 0) {
    toast(`Synced with ${summary.failures.length} feed failure${summary.failures.length === 1 ? '' : 's'} (${body})`, 'error')
  } else {
    toast(`Sync complete — ${body}`, 'success')
  }
}

export default function CalendarFeedsPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const text = dark ? '#f0f4ff' : '#1a1f36'
  const muted = dark ? '#94a3b8' : '#6b7280'
  const border = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'
  const cardBg = dark ? '#0d1525' : '#ffffff'
  const inputBg = dark ? '#0a0f1e' : '#f8f9fc'

  const router = useRouter()
  const supabase = createClient()

  const [ready, setReady] = useState(false)
  const [allowed, setAllowed] = useState(false)
  const [schools, setSchools] = useState<School[]>([])
  const [feedsBySchool, setFeedsBySchool] = useState<Record<string, Feed[]>>({})
  const [countsByFeed, setCountsByFeed] = useState<Record<string, FeedCounts>>({})
  const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  // Populated straight from a sync response, never persisted -- a "Retry
  // sync" always re-fetches the source fresh, so the candidate list here is
  // always what the guard would hold back right now, not a stale snapshot
  // from whenever the last cron run happened to catch it.
  const [massRemovalByFeed, setMassRemovalByFeed] = useState<Record<string, { candidates: MassRemovalCandidate[]; total: number }>>({})
  const [addingSchoolId, setAddingSchoolId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [newFeedOpen, setNewFeedOpen] = useState<Record<string, boolean>>({})
  const [newFeedLabel, setNewFeedLabel] = useState<Record<string, string>>({})
  const [newFeedUrl, setNewFeedUrl] = useState<Record<string, string>>({})

  const loadData = useCallback(async () => {
    const [{ data: schoolRows }, { data: feedRows }, countRows] = await Promise.all([
      supabase.from('schools')
        .select('id, name, short_name, level, type, primary_color')
        .or('type.eq.school,name.eq.Board of Education,name.eq.Canyons School District')
        .eq('active', true)
        .order('name'),
      supabase.from('calendar_school_feeds')
        .select(FEED_SELECT)
        .order('label'),
      fetchAllEventStatusRows(supabase),
    ])

    const schoolList: School[] = (schoolRows || []).slice().sort((a: School, b: School) => {
      if (a.type === 'district' && b.type !== 'district') return -1
      if (b.type === 'district' && a.type !== 'district') return 1
      return a.name.localeCompare(b.name)
    })
    setSchools(schoolList)

    const grouped: Record<string, Feed[]> = {}
    const draftMap: Record<string, string> = {}
    ;(feedRows || []).forEach((f: Feed) => {
      if (!grouped[f.school_id]) grouped[f.school_id] = []
      grouped[f.school_id].push(f)
      draftMap[f.id] = f.ics_url
    })
    Object.values(grouped).forEach(list => list.sort((a, b) => {
      if (a.last_sync_ok === false && b.last_sync_ok !== false) return -1
      if (b.last_sync_ok === false && a.last_sync_ok !== false) return 1
      return a.label.localeCompare(b.label)
    }))
    setFeedsBySchool(grouped)
    setUrlDrafts((prev: Record<string, string>) => ({ ...draftMap, ...prev }))

    const counts: Record<string, FeedCounts> = {}
    countRows.forEach((r: { feed_id: string | null; status: string }) => {
      if (!r.feed_id) return
      if (!counts[r.feed_id]) counts[r.feed_id] = {}
      counts[r.feed_id][r.status] = (counts[r.feed_id][r.status] || 0) + 1
    })
    setCountsByFeed(counts)
  }, [supabase])

  useEffect(() => {
    let cancelled = false
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.replace('/login?redirect=/dashboard/calendar/feeds')
        return
      }
      const { data: teamRow } = await supabase
        .from('team')
        .select('calendar_approver')
        .eq('supabase_user_id', session.user.id)
        .maybeSingle()

      if (cancelled) return
      if (!canManageCalendarQueue(teamRow?.calendar_approver)) {
        router.replace('/dashboard/calendar')
        return
      }
      setAllowed(true)
      await loadData()
      if (!cancelled) setReady(true)
    }
    init()
    return () => { cancelled = true }
  }, [supabase, router, loadData])

  async function saveFeed(feedId: string, schoolId: string) {
    const url = (urlDrafts[feedId] || '').trim()
    if (!url) return
    setSavingId(feedId)
    setError(null)
    const { data, error: updateError } = await supabase
      .from('calendar_school_feeds')
      .update({ ics_url: url })
      .eq('id', feedId)
      .select(FEED_SELECT)
      .single()
    setSavingId(null)
    if (updateError) {
      setError(updateError.message)
      return
    }
    if (data) {
      setFeedsBySchool((prev: Record<string, Feed[]>) => ({
        ...prev,
        [schoolId]: (prev[schoolId] || []).map(f => (f.id === feedId ? data : f)),
      }))
    }
  }

  async function removeFeed(feedId: string, schoolId: string, label: string) {
    // Deleting a feed row sets feed_id to null on its events (ON DELETE SET
    // NULL) but otherwise leaves them exactly as they were -- silently
    // orphaned, still visible if they'd been approved. Removing a feed is a
    // deliberate action (unlike a feed just being temporarily unreachable,
    // which never touches events -- see syncFeed's fail() path), so instead
    // flag its events as "removed from source" first. That's the same status
    // already used for events that vanish from a live sync, and it lands
    // them in the review queue for a human "Acknowledge" rather than
    // deleting anything outright.
    const { count } = await supabase
      .from('calendar_school_events')
      .select('id', { count: 'exact', head: true })
      .eq('feed_id', feedId)
      .neq('status', 'removed')

    const eventNote = count
      ? ` ${count} event${count === 1 ? '' : 's'} synced from it will be sent to the review queue to confirm removal.`
      : ' It has no active events to clean up.'
    const ok = await confirmDialog({
      message: `Remove the "${label}" feed?${eventNote}`,
      tone: 'danger',
      confirmLabel: 'Remove feed',
    })
    if (!ok) return

    setSavingId(feedId)
    setError(null)

    if (count) {
      const { error: cleanupError } = await supabase
        .from('calendar_school_events')
        .update({ status: 'removed', updated_at: new Date().toISOString() })
        .eq('feed_id', feedId)
        .neq('status', 'removed')
      if (cleanupError) {
        setSavingId(null)
        setError(cleanupError.message)
        return
      }
    }

    const { error: deleteError } = await supabase.from('calendar_school_feeds').delete().eq('id', feedId)
    setSavingId(null)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setFeedsBySchool((prev: Record<string, Feed[]>) => ({
      ...prev,
      [schoolId]: (prev[schoolId] || []).filter(f => f.id !== feedId),
    }))
    setUrlDrafts((prev: Record<string, string>) => {
      const next = { ...prev }
      delete next[feedId]
      return next
    })
    toast(count ? `Feed removed. ${count} event${count === 1 ? '' : 's'} sent to the review queue.` : 'Feed removed', 'success')
  }

  function openNewFeed(schoolId: string, suggestedLabel: string) {
    setNewFeedOpen((prev: Record<string, boolean>) => ({ ...prev, [schoolId]: true }))
    setNewFeedLabel((prev: Record<string, string>) => ({ ...prev, [schoolId]: prev[schoolId] || suggestedLabel }))
  }

  async function addFeed(schoolId: string) {
    const label = (newFeedLabel[schoolId] || '').trim()
    const url = (newFeedUrl[schoolId] || '').trim()
    if (!label || !url) return
    setAddingSchoolId(schoolId)
    setError(null)
    const { data, error: insertError } = await supabase
      .from('calendar_school_feeds')
      .insert({ school_id: schoolId, label, ics_url: url })
      .select(FEED_SELECT)
      .single()
    setAddingSchoolId(null)
    if (insertError) {
      setError(insertError.message.toLowerCase().includes('duplicate')
        ? `This school already has a feed labeled "${label}". Use a different label.`
        : insertError.message)
      return
    }
    if (data) {
      setFeedsBySchool((prev: Record<string, Feed[]>) => ({ ...prev, [schoolId]: [...(prev[schoolId] || []), data] }))
      setUrlDrafts((prev: Record<string, string>) => ({ ...prev, [data.id]: data.ics_url }))
      setNewFeedOpen((prev: Record<string, boolean>) => ({ ...prev, [schoolId]: false }))
      setNewFeedLabel((prev: Record<string, string>) => ({ ...prev, [schoolId]: '' }))
      setNewFeedUrl((prev: Record<string, string>) => ({ ...prev, [schoolId]: '' }))
      toast(`Added "${label}" feed`, 'success')
    }
  }

  // Rebuilds massRemovalByFeed from a sync response's per-feed results --
  // fresh every time, so a feed that's no longer suspicious (fixed itself,
  // or was just confirmed and applied) drops out automatically instead of
  // leaving a stale banner up.
  function applyMassRemovalResults(results: FeedSyncResult[] | undefined, onlyFeedId?: string) {
    if (!results) return
    setMassRemovalByFeed(prev => {
      const next = { ...prev }
      for (const r of results) {
        if (onlyFeedId && r.feedId !== onlyFeedId) continue
        if (r.massRemovalCandidates && r.massRemovalCandidates.length > 0) {
          next[r.feedId] = { candidates: r.massRemovalCandidates, total: r.massRemovalTotal || r.massRemovalCandidates.length }
        } else {
          delete next[r.feedId]
        }
      }
      return next
    })
  }

  async function syncAll() {
    try {
      const summary = await callSyncNow()
      summaryToast(summary)
      applyMassRemovalResults(summary.results)
      await loadData()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Sync failed', 'error')
    }
  }

  async function syncOne(feedId: string) {
    setSyncingId(feedId)
    try {
      const summary = await callSyncNow({ feedId })
      summaryToast(summary)
      applyMassRemovalResults(summary.results, feedId)
      await loadData()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Sync failed', 'error')
    } finally {
      setSyncingId(null)
    }
  }

  async function confirmMassRemoval(feedId: string, label: string, schoolName: string) {
    const info = massRemovalByFeed[feedId]
    if (!info) return
    const ok = await confirmDialog({
      message: `Mark ${info.total} event${info.total === 1 ? '' : 's'} removed for "${schoolName} · ${label}"? This applies what the source calendar reported -- review the list above first if you haven't. Nothing is deleted outright; removed events can still be restored from the review queue.`,
      tone: 'danger',
      confirmLabel: `Remove ${info.total} event${info.total === 1 ? '' : 's'}`,
    })
    if (!ok) return
    setSyncingId(feedId)
    try {
      const summary = await callSyncNow({ feedId, allowMassRemoval: true })
      summaryToast(summary)
      applyMassRemovalResults(summary.results, feedId)
      await loadData()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Removal failed', 'error')
    } finally {
      setSyncingId(null)
    }
  }

  const allFeeds = useMemo(() => Object.values(feedsBySchool).flat(), [feedsBySchool])
  const failingFeeds = useMemo(() => allFeeds.filter(f => f.last_sync_ok === false), [allFeeds])
  const staleFeeds = useMemo(
    () => allFeeds.map(f => ({ feed: f, reason: staleReason(f) })).filter((x): x is { feed: Feed; reason: string } => !!x.reason),
    [allFeeds]
  )
  const totalActiveEvents = useMemo(() => allFeeds.reduce((sum, f) => sum + activeCount(countsByFeed[f.id]), 0), [allFeeds, countsByFeed])
  const schoolMap = useMemo(() => new Map(schools.map(s => [s.id, s])), [schools])

  if (!ready) {
    return (
      <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '40px 20px', color: muted, fontSize: '15px' }}>
        Loading…
      </div>
    )
  }
  if (!allowed) return null

  const filtered = schools.filter((s: School) =>
    !search.trim() || s.name.toLowerCase().includes(search.trim().toLowerCase())
  )

  const statCardStyle = { background: cardBg, border: `0.5px solid ${border}`, borderRadius: '10px', padding: '10px 16px', minWidth: '110px' }

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' as const, marginBottom: '6px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: text, margin: '0 0 6px' }}>Calendar feeds</h1>
          <p style={{ fontSize: '15px', color: muted, margin: 0, lineHeight: 1.5, maxWidth: '640px' }}>
            Paste each school&apos;s public ICS calendar link here. Add a second feed for a school&apos;s athletics
            calendar if it has one. Synced events land in the review queue -- nothing shows on the district calendar
            until a staff member approves it there. Only events in the current school year (July 1 – June 30) are synced.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' as const }}>
          <Link href="/dashboard/calendar/review" style={{
            fontSize: '13.5px', padding: '9px 16px', borderRadius: '10px', background: 'transparent', color: muted,
            border: `0.5px solid ${border}`, textDecoration: 'none', fontWeight: 500, display: 'flex', alignItems: 'center', minHeight: '38px',
          }}>Review queue</Link>
          <Link href="/calendar" target="_blank" style={{
            fontSize: '13.5px', padding: '9px 16px', borderRadius: '10px', background: 'transparent', color: muted,
            border: `0.5px solid ${border}`, textDecoration: 'none', fontWeight: 500, display: 'flex', alignItems: 'center', minHeight: '38px',
          }}>View public calendar ↗</Link>
          <AsyncButton onClick={syncAll} pendingLabel="Syncing all…" style={{
            fontSize: '13.5px', padding: '0 18px', borderRadius: '10px', background: '#1e6cb5', color: '#fff',
            border: 'none', fontWeight: 500, minHeight: '38px',
          }}>Sync all now</AsyncButton>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' as const, margin: '20px 0 16px' }}>
        <div style={statCardStyle}>
          <p style={{ fontSize: '20px', fontWeight: 700, color: text, margin: 0 }}>{allFeeds.length}</p>
          <p style={{ fontSize: '12px', color: muted, margin: '2px 0 0' }}>Feeds</p>
        </div>
        <div style={statCardStyle}>
          <p style={{ fontSize: '20px', fontWeight: 700, color: failingFeeds.length > 0 ? '#ef4444' : text, margin: 0 }}>{failingFeeds.length}</p>
          <p style={{ fontSize: '12px', color: muted, margin: '2px 0 0' }}>Failing</p>
        </div>
        <div style={statCardStyle}>
          <p style={{ fontSize: '20px', fontWeight: 700, color: text, margin: 0 }}>{totalActiveEvents.toLocaleString()}</p>
          <p style={{ fontSize: '12px', color: muted, margin: '2px 0 0' }}>Events tracked</p>
        </div>
        <div style={statCardStyle}>
          <p style={{ fontSize: '20px', fontWeight: 700, color: staleFeeds.length > 0 ? '#d97706' : text, margin: 0 }}>{staleFeeds.length}</p>
          <p style={{ fontSize: '12px', color: muted, margin: '2px 0 0' }}>Needs a look</p>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.12)', border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 14px', color: '#ef4444', fontSize: '14px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {failingFeeds.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: '12px', padding: '14px 16px', marginBottom: '20px' }}>
          <p style={{ fontSize: '13.5px', fontWeight: 600, color: '#ef4444', margin: '0 0 10px' }}>
            {failingFeeds.length} feed{failingFeeds.length === 1 ? '' : 's'} failing to sync
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {failingFeeds.map(f => {
              const school = schoolMap.get(f.school_id)
              const syncing = syncingId === f.id
              const massRemoval = massRemovalByFeed[f.id]
              return (
                <div key={f.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' as const, fontSize: '13px' }}>
                    <span style={{ color: text, fontWeight: 500 }}>{school?.name || 'Unknown school'} · {f.label}</span>
                    <span style={{ color: muted }}>{f.last_sync_error || 'Sync failed'} · {relativeTime(f.last_synced_at)}</span>
                    <button
                      onClick={() => syncOne(f.id)}
                      disabled={syncing}
                      style={{
                        fontSize: '12.5px', padding: '5px 10px', borderRadius: '7px', background: 'transparent',
                        color: '#ef4444', border: '0.5px solid rgba(239,68,68,0.35)', cursor: syncing ? 'default' : 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      {syncing ? 'Syncing…' : 'Retry sync'}
                    </button>
                  </div>
                  {massRemoval && (
                    <div style={{ background: cardBg, border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '12px' }}>
                      <p style={{ fontSize: '12.5px', color: text, margin: '0 0 8px' }}>
                        This looks like it might be a real bulk change, not a glitch -- {massRemoval.total} event{massRemoval.total === 1 ? '' : 's'} on the source calendar are gone.
                        {massRemoval.candidates.length < massRemoval.total ? ` Showing the first ${massRemoval.candidates.length}:` : ' Here they are:'}
                      </p>
                      <div style={{ maxHeight: '160px', overflowY: 'auto' as const, border: `0.5px solid ${border}`, borderRadius: '8px', marginBottom: '10px' }}>
                        {massRemoval.candidates.map(c => (
                          <div key={c.id} style={{ padding: '6px 10px', borderBottom: `0.5px solid ${border}`, fontSize: '12.5px' }}>
                            <span style={{ color: text, fontWeight: 500 }}>{c.title || 'Untitled event'}</span>
                            <span style={{ color: muted }}> · {fmtCandidateDate(c.start)}{c.location ? ` · ${c.location}` : ''}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => confirmMassRemoval(f.id, f.label, school?.name || 'Unknown school')}
                          disabled={syncing}
                          style={{
                            fontSize: '12.5px', padding: '6px 12px', borderRadius: '7px', background: '#ef4444', color: '#fff',
                            border: 'none', fontWeight: 600, cursor: syncing ? 'default' : 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          Confirm removal
                        </button>
                        <span style={{ fontSize: '12px', color: muted, alignSelf: 'center' }}>
                          Only removes what&apos;s currently gone from the source -- nothing is deleted outright, and it can still be restored from the review queue.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {staleFeeds.length > 0 && (
        <div style={{ background: 'rgba(217,119,6,0.08)', border: '0.5px solid rgba(217,119,6,0.3)', borderRadius: '12px', padding: '14px 16px', marginBottom: '20px' }}>
          <p style={{ fontSize: '13.5px', fontWeight: 600, color: '#d97706', margin: '0 0 10px' }}>
            {staleFeeds.length} feed{staleFeeds.length === 1 ? '' : 's'} syncing OK but worth a look
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {staleFeeds.map(({ feed, reason }) => {
              const school = schoolMap.get(feed.school_id)
              const syncing = syncingId === feed.id
              return (
                <div key={feed.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' as const, fontSize: '13px' }}>
                  <span style={{ color: text, fontWeight: 500 }}>{school?.name || 'Unknown school'} · {feed.label}</span>
                  <span style={{ color: muted }}>{reason}</span>
                  <button
                    onClick={() => syncOne(feed.id)}
                    disabled={syncing}
                    style={{
                      fontSize: '12.5px', padding: '5px 10px', borderRadius: '7px', background: 'transparent',
                      color: '#d97706', border: '0.5px solid rgba(217,119,6,0.35)', cursor: syncing ? 'default' : 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {syncing ? 'Syncing…' : 'Sync now'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <input
        value={search}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        placeholder="Search schools..."
        style={{
          width: '100%', maxWidth: '360px', height: '40px', borderRadius: '10px',
          border: `0.5px solid ${border}`, background: inputBg, color: text,
          padding: '0 12px', fontSize: '14px', fontFamily: 'inherit', marginBottom: '16px',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filtered.map((school: School) => {
          const schoolFeeds = feedsBySchool[school.id] || []
          const isHighSchool = school.level === 'High School'
          const hasAthletics = schoolFeeds.some(f => isSportsLabel(f.label))
          const hasMain = schoolFeeds.some(f => f.label.toLowerCase() === 'main')
          const isOpen = !!newFeedOpen[school.id]

          return (
            <div
              key={school.id}
              style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column' as const, gap: '12px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' as const }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: school.primary_color || muted, flexShrink: 0 }} />
                <p style={{ fontSize: '15px', fontWeight: 500, color: text, margin: 0 }}>{school.name}</p>
                {school.type === 'district' && (
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#1e6cb5', background: 'rgba(30,108,181,0.14)', padding: '2px 8px', borderRadius: '20px' }}>District-wide</span>
                )}
                {schoolFeeds.length === 0 && <span style={{ fontSize: '12.5px', color: muted }}>No feeds yet</span>}
              </div>

              {schoolFeeds.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {schoolFeeds.map(feed => {
                    const draft = urlDrafts[feed.id] ?? ''
                    const dirty = draft.trim() !== feed.ics_url
                    const saving = savingId === feed.id
                    const syncing = syncingId === feed.id
                    const counts = countsByFeed[feed.id]
                    return (
                      <div key={feed.id} style={{ border: `0.5px solid ${border}`, borderRadius: '11px', padding: '12px', display: 'flex', flexDirection: 'column' as const, gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' as const }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: text, background: inputBg, padding: '3px 9px', borderRadius: '7px' }}>{feed.label}</span>
                          {feed.last_sync_ok === false ? (
                            <span style={{ fontSize: '12px', color: '#ef4444' }}>Sync failing · {relativeTime(feed.last_synced_at)}</span>
                          ) : feed.last_synced_at ? (
                            <span style={{ fontSize: '12px', color: muted }}>Synced {relativeTime(feed.last_synced_at)}</span>
                          ) : (
                            <span style={{ fontSize: '12px', color: muted }}>Not synced yet</span>
                          )}
                          {isSportsLabel(feed.label) && (
                            <span style={{ fontSize: '11px', color: muted }}>New events auto-tag as Athletics</span>
                          )}
                        </div>
                        <p style={{ fontSize: '12px', color: muted, margin: 0 }}>{countsSummary(counts)}</p>
                        {feed.rrule_event_count > 0 && (
                          <p style={{ fontSize: '11.5px', color: '#d97706', margin: 0 }}>
                            {feed.rrule_event_count} event{feed.rrule_event_count === 1 ? '' : 's'} in this feed use a recurrence rule (RRULE) we don&apos;t expand -- only
                            the first occurrence of each syncs. Let me know if this feed&apos;s events start looking incomplete.
                          </p>
                        )}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' as const }}>
                          <input
                            value={draft}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setUrlDrafts((prev: Record<string, string>) => ({ ...prev, [feed.id]: e.target.value }))}
                            placeholder="https://... .ics"
                            style={{ flex: 1, minWidth: '240px', height: '36px', borderRadius: '8px', border: `0.5px solid ${border}`, background: inputBg, color: text, padding: '0 10px', fontSize: '13px', fontFamily: 'inherit' }}
                          />
                          <button
                            onClick={() => syncOne(feed.id)}
                            disabled={syncing}
                            style={{ fontSize: '12.5px', padding: '8px 12px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: syncing ? 'default' : 'pointer', fontFamily: 'inherit', minHeight: '36px' }}
                          >
                            {syncing ? 'Syncing…' : 'Sync now'}
                          </button>
                          <button
                            onClick={() => saveFeed(feed.id, school.id)}
                            disabled={!dirty || saving || !draft.trim()}
                            style={{
                              fontSize: '12.5px', padding: '8px 14px', borderRadius: '8px',
                              background: dirty && draft.trim() ? '#1e6cb5' : border,
                              color: dirty && draft.trim() ? '#fff' : muted,
                              border: 'none', cursor: dirty && draft.trim() ? 'pointer' : 'default',
                              fontFamily: 'inherit', fontWeight: 500, minHeight: '36px',
                            }}
                          >
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={() => removeFeed(feed.id, school.id, feed.label)}
                            disabled={saving}
                            style={{ fontSize: '12.5px', padding: '8px 12px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', minHeight: '36px' }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {isOpen ? (
                <div style={{ border: `0.5px dashed ${border}`, borderRadius: '11px', padding: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' as const, alignItems: 'center' }}>
                  <input
                    value={newFeedLabel[school.id] || ''}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setNewFeedLabel((prev: Record<string, string>) => ({ ...prev, [school.id]: e.target.value }))}
                    placeholder="Label (e.g. Main, Athletics)"
                    style={{ width: '190px', height: '36px', borderRadius: '8px', border: `0.5px solid ${border}`, background: inputBg, color: text, padding: '0 10px', fontSize: '13px', fontFamily: 'inherit' }}
                  />
                  <input
                    value={newFeedUrl[school.id] || ''}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setNewFeedUrl((prev: Record<string, string>) => ({ ...prev, [school.id]: e.target.value }))}
                    placeholder="https://... .ics"
                    style={{ flex: 1, minWidth: '220px', height: '36px', borderRadius: '8px', border: `0.5px solid ${border}`, background: inputBg, color: text, padding: '0 10px', fontSize: '13px', fontFamily: 'inherit' }}
                  />
                  <button
                    onClick={() => addFeed(school.id)}
                    disabled={addingSchoolId === school.id || !(newFeedLabel[school.id] || '').trim() || !(newFeedUrl[school.id] || '').trim()}
                    style={{ fontSize: '12.5px', padding: '8px 14px', borderRadius: '8px', background: '#1e6cb5', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, minHeight: '36px' }}
                  >
                    {addingSchoolId === school.id ? 'Adding…' : 'Add'}
                  </button>
                  <button
                    onClick={() => setNewFeedOpen((prev: Record<string, boolean>) => ({ ...prev, [school.id]: false }))}
                    style={{ fontSize: '12.5px', color: muted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
                  <button
                    onClick={() => openNewFeed(school.id, hasMain ? '' : 'Main')}
                    style={{ fontSize: '12.5px', padding: '7px 12px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    + Add feed
                  </button>
                  {isHighSchool && !hasAthletics && (
                    <button
                      onClick={() => openNewFeed(school.id, 'Athletics')}
                      style={{ fontSize: '12.5px', padding: '7px 12px', borderRadius: '8px', background: 'transparent', color: muted, border: `0.5px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      + Add Athletics feed
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {filtered.length === 0 && (
          <p style={{ color: muted, fontSize: '14px', padding: '20px' }}>No schools match that search.</p>
        )}
      </div>
    </div>
  )
}
