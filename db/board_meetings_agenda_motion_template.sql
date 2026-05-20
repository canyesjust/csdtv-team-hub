-- Per-agenda-item suggested motion text for motion screen auto-fill (idempotent)
-- Apply in Supabase SQL Editor.

ALTER TABLE public.board_meeting_agenda_items
  ADD COLUMN IF NOT EXISTS suggested_motion_text text;
