-- Capture more of what each ICS event actually carries, instead of parsing
-- out only title/start/end/location/description and discarding the rest.
-- Applied live via the Supabase MCP on 2026-08-13.
--
-- is_all_day: whether the source declared this a whole-day entry (DTSTART
--   VALUE=DATE) rather than a specific time -- lets the UI show "All day"
--   instead of a misleading midnight timestamp (not yet wired into display
--   components as of this migration -- the data is captured, the calendar
--   UI still needs a follow-up to use it).
-- organizer_name / organizer_email: from the ICS ORGANIZER property.
-- busy_status: 'busy' | 'free' | null, from TRANSP (OPAQUE/TRANSPARENT).
-- source_sequence: the source tool's own edit-counter (SEQUENCE), used as
--   an extra "did this change" signal in lib/server/calendar-sync.ts.
-- source_url: the ICS URL property, if the source includes a link back to
--   the original event.
-- rrule: the raw recurrence rule text, if present. Not expanded (see
--   lib/calendar-ics-parse.ts's doc comment) but preserved either way.
-- source_categories / source_class: the source's own CATEGORIES/CLASS
--   values, kept separate from this app's own category field.
-- source_created_at / source_modified_at: from the source's CREATED /
--   LAST-MODIFIED properties.
-- raw_ics: the complete raw VEVENT block, verbatim (unfolded), as an
--   archival fallback covering every property not explicitly extracted
--   above (ATTACH, CONTACT, GEO, X-* extensions, etc).

alter table public.calendar_school_events
  add column if not exists is_all_day boolean not null default false,
  add column if not exists organizer_name text,
  add column if not exists organizer_email text,
  add column if not exists busy_status text,
  add column if not exists source_sequence integer,
  add column if not exists source_url text,
  add column if not exists rrule text,
  add column if not exists source_categories text,
  add column if not exists source_class text,
  add column if not exists source_created_at timestamptz,
  add column if not exists source_modified_at timestamptz,
  add column if not exists raw_ics text;
