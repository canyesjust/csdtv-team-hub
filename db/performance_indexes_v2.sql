-- ============================================================================
-- Phase 4: performance index pass (idempotent)
-- Run in the Supabase SQL Editor. Safe to re-run. Review before applying.
--
-- Method: profiled every .eq()/.order()/.in() filter in the app against the
-- 51 indexes already defined across db/. Postgres does NOT auto-index foreign
-- key columns, so FK columns on large, growing tables are the main gap.
--
-- What is ALREADY covered (no action needed):
--   * Board live output path (the 350ms poller): meeting_timers,
--     meeting_broadcast_state, meeting_playlists all have board_meeting_id
--     UNIQUE (self-indexed); meeting_motions, board_meeting_agenda_items,
--     channel_assignments, meeting_event_log are indexed; output_channels
--     .channel_number is UNIQUE. The hot path is fine.
--   * Signage screen feeds (5s poll): signage_content_resolve_idx and
--     signage_ann_resolve_idx already cover the resolve queries.
--   * productions(start_datetime,status), tasks(status,due_date),
--     tasks(assigned_to,status), production_activity(production_id,action).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- STEP 0 (optional): see what indexes already exist on the target tables,
-- so you can confirm none of the below are redundant before applying.
-- ----------------------------------------------------------------------------
-- SELECT tablename, indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'productions','production_members','checklist_items','production_links',
--     'tasks','videos','comments','notifications'
--   )
-- ORDER BY tablename, indexname;


-- ----------------------------------------------------------------------------
-- HIGH VALUE: foreign-key columns on large/growing tables, filtered on every
-- production-detail load, dashboard, and RLS check. None of these tables have
-- any secondary index today.
-- ----------------------------------------------------------------------------

-- Production detail page loads by the clean URL param (production_number) on
-- every visit. productions grows ~250+ rows/year.
-- NOTE: if a UNIQUE constraint on production_number already exists (check
-- STEP 0), skip this one -- it would be redundant.
CREATE INDEX IF NOT EXISTS idx_productions_production_number
  ON public.productions (production_number);

-- production_members is joined on every production load and in RLS checks.
CREATE INDEX IF NOT EXISTS idx_production_members_production_id
  ON public.production_members (production_id);

CREATE INDEX IF NOT EXISTS idx_production_members_user_id
  ON public.production_members (user_id);

-- checklist_items: loaded for every production, also read by the call-sheet
-- generator and copy-setup.
CREATE INDEX IF NOT EXISTS idx_checklist_items_production_id
  ON public.checklist_items (production_id);

-- Linked tasks on the production detail page; tasks is one of the largest
-- tables. Partial index keeps it small (most tasks have no production_id).
CREATE INDEX IF NOT EXISTS idx_tasks_production_id
  ON public.tasks (production_id)
  WHERE production_id IS NOT NULL;

-- Linked videos on production detail + video library cross-links.
CREATE INDEX IF NOT EXISTS idx_videos_production_id
  ON public.videos (production_id);

-- Production links tab.
CREATE INDEX IF NOT EXISTS idx_production_links_production_id
  ON public.production_links (production_id);

-- Comments are polymorphic (entity_type + entity_id), loaded on the comments
-- tab. Composite matches the lookup shape exactly.
CREATE INDEX IF NOT EXISTS idx_comments_entity
  ON public.comments (entity_type, entity_id);

-- Notification panel polls for a user's unread items. Partial index targets
-- the unread badge; the user_id prefix also serves the full list.
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id)
  WHERE read = false;


-- ----------------------------------------------------------------------------
-- OPTIONAL / VERIFY COLUMN NAMES FIRST
-- The student-crew schema is not in db/, so confirm the column names in the
-- Table Editor before running these. Add them if the student crew sign-up
-- pages feel slow as that data grows.
-- ----------------------------------------------------------------------------
-- CREATE INDEX IF NOT EXISTS idx_crew_role_slots_production_id
--   ON public.crew_role_slots (production_id);
-- CREATE INDEX IF NOT EXISTS idx_crew_signups_slot
--   ON public.crew_signups (crew_role_slot_id);


-- ----------------------------------------------------------------------------
-- INTENTIONALLY SKIPPED
--   * team(supabase_user_id): resolved on every request, but the team table is
--     tiny (tens of rows) -- Postgres seq-scans it faster than an index. Not
--     worth adding.
--   * Board-meeting child tables on board_meeting_id (presenters, attendance,
--     agenda_documents, lower_third_*): a few rows per meeting; seq scan is
--     already fast. Indexing adds maintenance cost for no real gain.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- For the larger tables (tasks, videos, productions) you can run these without
-- locking writes by using CONCURRENTLY instead -- but it cannot run inside a
-- transaction block, so run each line on its own, e.g.:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_production_id
--     ON public.tasks (production_id) WHERE production_id IS NOT NULL;
-- At current data sizes the plain statements above complete in well under a
-- second, so CONCURRENTLY is optional.
-- ----------------------------------------------------------------------------
