-- Feed health signals beyond plain success/failure. Applied live via the
-- Supabase MCP on 2026-08-12.
--
-- rrule_event_count: how many VEVENTs in the feed's last successful fetch
--   carried an RRULE (a recurrence rule the parser doesn't expand -- see
--   lib/calendar-ics-parse.ts's doc comment). Most school calendar tools
--   publish one VEVENT per occurrence instead, which this parser handles
--   fine; a feed that starts using RRULE-style recurrence would otherwise
--   silently lose everything after the first occurrence with no error and
--   no obvious symptom. Surfaced on the Feeds page so that's caught before
--   it becomes a support mystery, not after.
-- last_changed_at: the last time a sync for this feed actually added,
--   updated, or removed an event -- as opposed to last_synced_at, which
--   moves on every run including ones that found nothing different. A feed
--   that's been reporting success for weeks but hasn't touched this column
--   in that whole time is quietly stale, the same failure mode that hid the
--   Albion Middle problem (sync "succeeding," silently adding nothing).
-- last_etag / last_modified_header: the ETag / Last-Modified response
--   headers from the feed's last successful fetch, if the source sent them.
--   Sent back as If-None-Match / If-Modified-Since on the next sync so a
--   source that supports conditional requests can reply "304 Not Modified"
--   instead of resending the whole calendar. Sources that never send these
--   headers simply never get anything sent back -- no behavior change for
--   them.

alter table public.calendar_school_feeds
  add column if not exists rrule_event_count integer not null default 0,
  add column if not exists last_changed_at timestamptz,
  add column if not exists last_etag text,
  add column if not exists last_modified_header text;
