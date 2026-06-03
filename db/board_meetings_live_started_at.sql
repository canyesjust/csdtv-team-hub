-- Persist actual go-live time for YouTube chapters and archive offsets.
ALTER TABLE public.board_meetings
  ADD COLUMN IF NOT EXISTS live_started_at timestamptz;
