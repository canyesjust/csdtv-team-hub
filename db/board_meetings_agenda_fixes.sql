-- Board meetings agenda / presenter fixes (idempotent)
-- Apply in Supabase SQL Editor.

ALTER TABLE public.board_meeting_presenters
  ADD COLUMN IF NOT EXISTS affiliation text;
