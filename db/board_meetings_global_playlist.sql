-- One global pre-roll playlist for ALL board meetings (replaces per-meeting playlists).
-- Run in Supabase. Idempotent.
--
-- Before: each board meeting had its own meeting_playlists row (board_meeting_id UNIQUE).
-- After: a single "global" row identified by board_meeting_id IS NULL drives the
-- pre-roll for every meeting. Old per-meeting rows are left in place but ignored.

-- Allow the global row to have no meeting.
ALTER TABLE public.meeting_playlists ALTER COLUMN board_meeting_id DROP NOT NULL;

-- Exactly one global row (Postgres UNIQUE allows many NULLs, so guard with a
-- partial unique index on a constant expression).
CREATE UNIQUE INDEX IF NOT EXISTS meeting_playlists_single_global
  ON public.meeting_playlists ((board_meeting_id IS NULL))
  WHERE board_meeting_id IS NULL;

-- Seed the global playlist if it doesn't exist yet. Always-on: starts "playing",
-- and plays through recess so the screens never sit blank between sessions.
INSERT INTO public.meeting_playlists (board_meeting_id, playback_state, play_during_recess)
SELECT NULL, 'playing', true
WHERE NOT EXISTS (SELECT 1 FROM public.meeting_playlists WHERE board_meeting_id IS NULL);

UPDATE public.meeting_playlists SET play_during_recess = true WHERE board_meeting_id IS NULL;
