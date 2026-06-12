-- Record when the YouTube stream actually started (during preroll, before the gavel).
-- This is the video's 0:00 and the anchor for YouTube chapter timestamps. It is
-- distinct from live_started_at, which is the gavel / official meeting start.
alter table public.board_meetings
  add column if not exists stream_started_at timestamptz;
