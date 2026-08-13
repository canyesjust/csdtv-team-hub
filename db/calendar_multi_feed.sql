-- Allow multiple ICS feeds per school (e.g. a school's main calendar plus a
-- separate athletics/sports calendar). Applied live via the Supabase MCP on
-- 2026-08-12. Every existing feed row got label = 'Main' by the default.
--
-- lib/server/calendar-sync.ts, app/dashboard/calendar/feeds/page.tsx, and
-- app/api/calendar/sync-now already iterate every row in
-- calendar_school_feeds regardless of label -- no other schema changes were
-- needed to support multiple feeds per school.

alter table public.calendar_school_feeds add column if not exists label text not null default 'Main';
alter table public.calendar_school_feeds drop constraint if exists calendar_school_feeds_school_id_key;
alter table public.calendar_school_feeds add constraint calendar_school_feeds_school_id_label_key unique (school_id, label);
