-- Building takeover: a scheduled signage_content row that exclusively replaces
-- the normal feed on every screen in its target building(s) for a precise time
-- window, then reverts automatically when the window ends. Reuses the existing
-- content model end-to-end (image/video/HTML, AI generation, the approval
-- queue, and target_buildings targeting) — this just adds the takeover flag and
-- the precise start/end timestamps. start_date/end_date (already NOT NULL on
-- this table) are derived server-side from these timestamps for takeover rows,
-- so the existing day-level isInDateRange filter still gates them correctly;
-- these two columns add minute-level precision on top of that.
alter table public.signage_content add column if not exists is_takeover boolean not null default false;
alter table public.signage_content add column if not exists takeover_starts_at timestamptz;
alter table public.signage_content add column if not exists takeover_ends_at timestamptz;

-- Fast lookup for "is a building takeover active right now" on every screen-feed
-- request. Partial index — only takeover rows ever need this lookup path.
create index if not exists signage_content_takeover_active_idx
  on public.signage_content (takeover_starts_at, takeover_ends_at)
  where is_takeover = true and status = 'approved';
